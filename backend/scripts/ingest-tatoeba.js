// Ingest a Tatoeba sentence-pair corpus for the grammar tutor (Phase 4).
//
//   node scripts/ingest-tatoeba.js --target=fra --native=eng --limit=3000
//
// Source: manythings.org/anki pair files — Tatoeba-derived, CC-BY 2.0 FR,
// per-line attribution with original sentence ids preserved. (The canonical
// alternative is downloads.tatoeba.org's per-language exports, which need a
// three-file bz2 join for the same result.)
//
// Requires MONGO_URI and GEMINI_API_KEY in backend/.env. Costs: ~30 embedding
// batches for 3000 sentences (free tier), ~20 MB of Atlas storage.
// Re-runnable: upserts on (pair, tatoebaId), so it resumes/refreshes safely.

import "dotenv/config";
import mongoose from "mongoose";
import { unzipSync, strFromU8 } from "fflate";
import GrammarSentence from "../src/models/GrammarSentence.js";
import { embedTexts, isEmbeddingsConfigured } from "../src/lib/embeddings.js";
import { parsePairFile } from "./lib/tatoebaParse.js";

const arg = (name, fallback) => {
  const found = process.argv.find((a) => a.startsWith(`--${name}=`));
  return found ? found.split("=")[1] : fallback;
};

const TARGET = arg("target", "fra"); // language being learned (ISO 639-3)
const NATIVE = arg("native", "eng"); // learner's language — manythings files are eng-based
const LIMIT = parseInt(arg("limit", "3000"), 10);
const EMBED_BATCH = 100;
const PAIR = `${TARGET}-${NATIVE}`;

if (NATIVE !== "eng") {
  console.error("manythings.org pair files are English-based; --native must be eng.");
  console.error("For non-English native languages, adapt this script to downloads.tatoeba.org exports.");
  process.exit(1);
}
if (!process.env.MONGO_URI) {
  console.error("MONGO_URI is not set.");
  process.exit(1);
}
if (!isEmbeddingsConfigured()) {
  console.error("GEMINI_API_KEY is not set - sentences would be stored without vectors. Aborting.");
  process.exit(1);
}

const url = `https://www.manythings.org/anki/${TARGET}-eng.zip`;
console.log(`[ingest] Downloading ${url} ...`);
const response = await fetch(url, { headers: { "User-Agent": "speakzy-ingest/1.0" } });
if (!response.ok) {
  console.error(`Download failed: ${response.status}. Is "${TARGET}" a valid pair at manythings.org/anki?`);
  process.exit(1);
}
const zipped = new Uint8Array(await response.arrayBuffer());
console.log(`[ingest] Downloaded ${(zipped.length / 1e6).toFixed(1)} MB, extracting...`);

const files = unzipSync(zipped);
const txtName = Object.keys(files).find((f) => f.endsWith(".txt") && !f.startsWith("_"));
if (!txtName) {
  console.error(`No .txt file in the archive (found: ${Object.keys(files).join(", ")})`);
  process.exit(1);
}
const content = strFromU8(files[txtName]);

const sentences = parsePairFile(content, LIMIT);
console.log(`[ingest] Parsed ${txtName}: ${sentences.length} beginner sentences after filtering/dedupe (limit ${LIMIT})`);

await mongoose.connect(process.env.MONGO_URI);

// Resume efficiently: the free tier caps embeddings at ~1000/day, so never
// re-embed sentences that already have vectors from a previous run.
const existing = await GrammarSentence.find({ pair: PAIR, "embedding.0": { $exists: true } })
  .select("tatoebaId")
  .lean();
const alreadyEmbedded = new Set(existing.map((d) => d.tatoebaId));
const pending = sentences.filter((s) => !alreadyEmbedded.has(s.tatoebaId));
console.log(
  `[ingest] Connected to MongoDB. ${alreadyEmbedded.size} already embedded for "${PAIR}", ${pending.length} to go.`
);

// Free-tier embeddings allow ~100 requests/min and every text in a batch
// counts as one request — so one full batch consumes the whole window.
// Pace proactively, and honor the server's retry hint on a 429.
const BATCH_PAUSE_MS = 65_000;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function embedBatchWithRetry(texts) {
  try {
    return await embedTexts(texts);
  } catch (error) {
    const retrySecs = parseFloat(/retry in ([\d.]+)s/i.exec(error.message)?.[1]) || 65;
    if (!error.message.includes("429")) throw error;
    console.log(`\n[ingest] Rate limited - waiting ${Math.ceil(retrySecs)}s and retrying...`);
    await wait((retrySecs + 2) * 1000);
    return await embedTexts(texts);
  }
}

let upserted = 0;
for (let i = 0; i < pending.length; i += EMBED_BATCH) {
  if (i > 0) await wait(BATCH_PAUSE_MS);
  const batch = pending.slice(i, i + EMBED_BATCH);
  const vectors = await embedBatchWithRetry(batch.map((s) => s.targetText));

  await GrammarSentence.bulkWrite(
    batch.map((s, j) => ({
      updateOne: {
        filter: { pair: PAIR, tatoebaId: s.tatoebaId },
        update: {
          $set: {
            targetText: s.targetText,
            nativeText: s.nativeText,
            embedding: vectors[j],
          },
        },
        upsert: true,
      },
    }))
  );

  upserted += batch.length;
  process.stdout.write(`\r[ingest] ${upserted}/${pending.length} embedded + upserted`);
}

const total = await GrammarSentence.countDocuments({ pair: PAIR });
console.log(`\n[ingest] Done. Pair "${PAIR}" now has ${total} sentences in the corpus.`);
console.log(`[ingest] Attribution: sentences (c) tatoeba.org contributors, CC-BY 2.0 FR.`);
await mongoose.disconnect();
