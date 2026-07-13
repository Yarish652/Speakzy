import mongoose from "mongoose";
import StudiedWord from "../models/StudiedWord.js";
import GrammarSentence from "../models/GrammarSentence.js";

// Retrieval interface for the RAG pipeline, with two interchangeable drivers:
//
//   memory (default) - fetch the user's word vectors and rank by cosine in
//     Node. A user knows at most a few hundred words, so brute force is
//     microseconds — and it works on ANY MongoDB (local dev, the CI
//     container, Atlas) with zero index setup.
//
//   atlas (VECTOR_DRIVER=atlas) - MongoDB Atlas $vectorSearch. Needed when a
//     corpus outgrows brute force (Phase 4's ~50k Tatoeba sentences). For
//     StudiedWord it requires a vector index named "studiedword_embedding"
//     (path: embedding, 768 dims, cosine, filter fields: userId,
//     targetLanguage) created in the Atlas UI.
//
// Being able to explain when brute force beats an index is the point of
// keeping both.

// Case- and diacritic-insensitive normalization ("Café" -> "cafe") used for
// both retrieval hygiene and the post-generation duplicate filter.
export function normalizeWord(word) {
  return (word || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip combining diacritics after NFD split
    .trim()
    .toLowerCase();
}

export function cosineSimilarity(a, b) {
  if (!a?.length || !b?.length || a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

async function memoryDriver({ userId, targetLanguage, queryVector, k }) {
  const words = await StudiedWord.find({
    userId,
    targetLanguage,
    "embedding.0": { $exists: true }, // only docs whose backfill has landed
  }).select("+embedding targetWord");

  return words
    .map((w) => ({ targetWord: w.targetWord, score: cosineSimilarity(queryVector, w.embedding) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
    .map((w) => w.targetWord);
}

async function atlasDriver({ userId, targetLanguage, queryVector, k }) {
  const results = await StudiedWord.aggregate([
    {
      $vectorSearch: {
        index: "studiedword_embedding",
        path: "embedding",
        queryVector,
        numCandidates: Math.max(k * 10, 50),
        limit: k,
        filter: {
          userId: new mongoose.Types.ObjectId(userId),
          targetLanguage,
        },
      },
    },
    { $project: { targetWord: 1 } },
  ]);
  return results.map((r) => r.targetWord);
}

// Top-k of the user's known words semantically closest to queryVector.
// Returns [] when retrieval isn't possible (no vector, no data, driver
// error) — personalization degrades, generation never fails because of it.
export async function retrieveRelatedKnownWords({ userId, targetLanguage, queryVector, k = 8 }) {
  if (!queryVector) return [];

  const driver = process.env.VECTOR_DRIVER === "atlas" ? atlasDriver : memoryDriver;
  try {
    return await driver({ userId, targetLanguage, queryVector, k });
  } catch (error) {
    console.error("[RAG] Retrieval failed, continuing without known-word context:", error.message);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Grammar-sentence retrieval (Phase 4). Unlike a user's words (hundreds),
// this corpus is thousands of docs per language pair — big enough that the
// memory driver caches each pair's vectors in-process after the first load
// (capped) instead of re-fetching per query, and big enough that production
// should prefer the Atlas driver (index "grammarsentence_embedding", path
// embedding, 768 dims, cosine, filter field: pair).

const MEMORY_CORPUS_CAP = 10000;
const sentenceCorpusCache = new Map(); // pair -> [{ targetText, nativeText, tatoebaId, embedding }]

// Exposed for tests (the cache would otherwise leak between test cases).
export function clearSentenceCorpusCache() {
  sentenceCorpusCache.clear();
}

async function memorySentenceDriver({ pair, queryVector, k }) {
  if (!sentenceCorpusCache.has(pair)) {
    const docs = await GrammarSentence.find({ pair, "embedding.0": { $exists: true } })
      .limit(MEMORY_CORPUS_CAP)
      .select("+embedding targetText nativeText tatoebaId")
      .lean();
    sentenceCorpusCache.set(pair, docs);
  }

  return sentenceCorpusCache
    .get(pair)
    .map((doc) => ({ doc, score: cosineSimilarity(queryVector, doc.embedding) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
    .map(({ doc }) => ({ targetText: doc.targetText, nativeText: doc.nativeText, tatoebaId: doc.tatoebaId }));
}

async function atlasSentenceDriver({ pair, queryVector, k }) {
  const results = await GrammarSentence.aggregate([
    {
      $vectorSearch: {
        index: "grammarsentence_embedding",
        path: "embedding",
        queryVector,
        numCandidates: Math.max(k * 15, 100),
        limit: k,
        filter: { pair },
      },
    },
    { $project: { targetText: 1, nativeText: 1, tatoebaId: 1 } },
  ]);
  return results.map((r) => ({ targetText: r.targetText, nativeText: r.nativeText, tatoebaId: r.tatoebaId }));
}

// Top-k corpus sentences most similar to the query. Returns [] on any
// failure — the grammar tutor then explains without citations.
export async function retrieveSimilarSentences({ pair, queryVector, k = 5 }) {
  if (!pair || !queryVector) return [];

  const driver = process.env.VECTOR_DRIVER === "atlas" ? atlasSentenceDriver : memorySentenceDriver;
  try {
    return await driver({ pair, queryVector, k });
  } catch (error) {
    console.error("[RAG] Sentence retrieval failed, continuing without citations:", error.message);
    return [];
  }
}
