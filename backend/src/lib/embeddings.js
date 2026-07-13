// Text embeddings via Google's gemini-embedding-001 (free tier).
// OpenRouter only proxies chat completions — embeddings need their own
// provider, which is why this module exists separately from lib/llm.js.
//
// Notes that matter (verified July 2026):
// - text-embedding-004 was SHUT DOWN on 2026-01-14; gemini-embedding-001 is
//   the current stable model.
// - The key goes in the x-goog-api-key header (works for both old AIza keys
//   and the new "AQ."-prefixed auth keys AI Studio now issues).
// - Default output is 3072 dims; we request 768 (Matryoshka truncation) to
//   keep stored vectors small. Truncated vectors are not pre-normalized,
//   which is fine: cosine similarity normalizes by magnitude anyway.
//
// Degrades gracefully: with no GEMINI_API_KEY configured, embed calls return
// null and callers skip retrieval. Personalized generation still works via
// the exclusion list (which needs no vectors); only the "reuse known words
// in examples" retrieval step is skipped.

const EMBED_MODEL = "gemini-embedding-001";
const EMBED_DIMS = 768;
const BATCH_URL = `https://generativelanguage.googleapis.com/v1beta/models/${EMBED_MODEL}:batchEmbedContents`;

export function isEmbeddingsConfigured() {
  return Boolean(process.env.GEMINI_API_KEY);
}

// texts: string[] -> number[][] (768-dim vectors), or null when unconfigured.
// Throws on API errors so callers can decide whether to degrade or fail.
export async function embedTexts(texts) {
  if (!isEmbeddingsConfigured() || !Array.isArray(texts) || texts.length === 0) {
    return null;
  }

  const response = await fetch(BATCH_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": process.env.GEMINI_API_KEY,
    },
    body: JSON.stringify({
      requests: texts.map((text) => ({
        model: `models/${EMBED_MODEL}`,
        content: { parts: [{ text }] },
        outputDimensionality: EMBED_DIMS,
      })),
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Embeddings API error: ${response.status} ${errorText}`);
  }

  const data = await response.json();
  return data.embeddings.map((e) => e.values);
}

export async function embedText(text) {
  const vectors = await embedTexts([text]);
  return vectors ? vectors[0] : null;
}
