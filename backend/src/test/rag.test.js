import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import mongoose from "mongoose";
import { getNextFlashcards } from "../controllers/ai.controller.js";
import StudiedWord from "../models/StudiedWord.js";
import LlmCall from "../models/LlmCall.js";
import { normalizeWord, cosineSimilarity, retrieveRelatedKnownWords } from "../lib/retrieval.js";

vi.mock("../models/User.js", () => ({
  default: {
    findByIdAndUpdate: vi.fn(),
  },
}));

// Deterministic vectors instead of a real embeddings API. Every embed call
// returns [1, 0], so a studied word stored with [1, 0] ranks closest and one
// stored with [0, 1] ranks farthest.
vi.mock("../lib/embeddings.js", () => ({
  isEmbeddingsConfigured: () => true,
  embedText: vi.fn(async () => [1, 0]),
  embedTexts: vi.fn(async (texts) => texts.map(() => [1, 0])),
}));

function buildRes() {
  const res = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

function buildReq(userId) {
  return {
    user: {
      _id: userId,
      nativeLanguage: "English",
      learningLanguage: "French",
      flashcardUsage: { count: 0, lastDate: "", cards: [] },
    },
  };
}

function mockSet(words) {
  return {
    ok: true,
    json: async () => ({
      choices: [
        {
          message: {
            content: JSON.stringify({
              flashcards: words.map((targetWord) => ({
                nativeWord: `en-${targetWord}`,
                targetWord,
                category: "food",
              })),
            }),
          },
        },
      ],
    }),
  };
}

describe("retrieval primitives", () => {
  it("normalizes case and diacritics (guards against encoding corruption too)", () => {
    expect(normalizeWord("Café")).toBe("cafe");
    expect(normalizeWord("  École ")).toBe("ecole");
    expect(normalizeWord("naïve")).toBe("naive");
  });

  it("computes cosine similarity", () => {
    expect(cosineSimilarity([1, 0], [1, 0])).toBe(1);
    expect(cosineSimilarity([1, 0], [0, 1])).toBe(0);
    expect(cosineSimilarity([], [1])).toBe(0);
  });

  it("memory driver ranks the user's words by similarity to the query vector", async () => {
    const userId = new mongoose.Types.ObjectId();
    await StudiedWord.create([
      { userId, targetWord: "pain", wordKey: "pain", targetLanguage: "french", embedding: [1, 0] },
      { userId, targetWord: "eau", wordKey: "eau", targetLanguage: "french", embedding: [0, 1] },
    ]);

    const top = await retrieveRelatedKnownWords({
      userId,
      targetLanguage: "french",
      queryVector: [1, 0],
      k: 1,
    });

    expect(top).toEqual(["pain"]);
  });

  it("returns [] without a query vector (embeddings unconfigured path)", async () => {
    const result = await retrieveRelatedKnownWords({
      userId: new mongoose.Types.ObjectId(),
      targetLanguage: "french",
      queryVector: null,
    });
    expect(result).toEqual([]);
  });
});

describe("personalized generation pipeline", () => {
  let userId;

  beforeEach(async () => {
    vi.clearAllMocks();
    process.env.OPENROUTER_API_KEY = "test-key";
    vi.stubGlobal("fetch", vi.fn());
    userId = new mongoose.Types.ObjectId().toString();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  async function seedStudied() {
    await StudiedWord.create([
      { userId, targetWord: "pain", wordKey: "pain", targetLanguage: "french", embedding: [1, 0] },
      { userId, targetWord: "eau", wordKey: "eau", targetLanguage: "french", embedding: [0, 1] },
    ]);
  }

  it("puts studied words in the prompt as exclusions and retrieved words as weave context", async () => {
    await seedStudied();
    globalThis.fetch.mockResolvedValueOnce(mockSet(["fromage", "lait", "riz", "sel", "sucre"]));

    await getNextFlashcards(buildReq(userId), buildRes());

    const promptSent = JSON.parse(fetch.mock.calls[0][1].body).messages[0].content;
    expect(promptSent).toContain("do NOT use any of them as a targetWord");
    expect(promptSent).toContain("pain");
    expect(promptSent).toContain("eau");
    expect(promptSent).toContain("reuse a few of these words");
  });

  it("post-filters studied words the model repeated and retries once for replacements", async () => {
    await seedStudied();
    globalThis.fetch
      // Model ignores the exclusion rule and repeats "pain" (studied).
      .mockResolvedValueOnce(mockSet(["pain", "lait", "riz", "sel", "sucre"]))
      // Retry returns replacements; "Pain" (case difference) must still be filtered.
      .mockResolvedValueOnce(mockSet(["Pain", "fromage", "beurre"]));

    const res = buildRes();
    await getNextFlashcards(buildReq(userId), res);

    expect(fetch).toHaveBeenCalledTimes(2);
    const served = res.json.mock.calls[0][0].flashcards.map((c) => c.targetWord);
    expect(served).toHaveLength(5);
    expect(served).not.toContain("pain");
    expect(served).not.toContain("Pain");
    expect(served).toContain("fromage");

    // The retry prompt must also exclude the words from the first attempt.
    const retryPrompt = JSON.parse(fetch.mock.calls[1][1].body).messages[0].content;
    expect(retryPrompt).toContain("lait");
  });

  it("serves the filtered set when the replacement retry fails entirely", async () => {
    await seedStudied();
    globalThis.fetch
      .mockResolvedValueOnce(mockSet(["pain", "lait", "riz", "sel", "sucre"]))
      // Retry fails on both models.
      .mockResolvedValue({ ok: false, status: 500, text: async () => "down" });

    const res = buildRes();
    await getNextFlashcards(buildReq(userId), res);

    const served = res.json.mock.calls[0][0].flashcards.map((c) => c.targetWord);
    expect(served).toHaveLength(4); // 5 generated minus the studied "pain"
    expect(served).not.toContain("pain");
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("cold start: no personalization rules in the prompt, retrievedCount 0 in meta", async () => {
    globalThis.fetch.mockResolvedValueOnce(mockSet(["uno", "dos", "tres", "cuatro", "cinco"]));

    await getNextFlashcards(buildReq(userId), buildRes());

    const promptSent = JSON.parse(fetch.mock.calls[0][1].body).messages[0].content;
    expect(promptSent).not.toContain("ALREADY STUDIED");
    expect(promptSent).not.toContain("reuse a few of these words");

    await vi.waitFor(async () => {
      const call = await LlmCall.findOne({ userId, success: true });
      expect(call.meta.excludedCount).toBe(0);
      expect(call.meta.retrievedCount).toBe(0);
    });
  });

  it("records retrievedCount > 0 in LlmCall.meta for a user with history", async () => {
    await seedStudied();
    globalThis.fetch.mockResolvedValueOnce(mockSet(["fromage", "lait", "riz", "sel", "sucre"]));

    await getNextFlashcards(buildReq(userId), buildRes());

    await vi.waitFor(async () => {
      const call = await LlmCall.findOne({ userId, success: true });
      expect(call.meta.excludedCount).toBe(2);
      expect(call.meta.retrievedCount).toBe(2);
    });
  });
});
