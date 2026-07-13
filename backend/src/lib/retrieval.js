import mongoose from "mongoose";
import StudiedWord from "../models/StudiedWord.js";

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
