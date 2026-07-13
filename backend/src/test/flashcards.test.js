import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import mongoose from "mongoose";
import { getFlashcards, getNextFlashcards, PROMPT_VERSION } from "../controllers/ai.controller.js";
import User from "../models/User.js";
import LlmCall from "../models/LlmCall.js";

vi.mock("../models/User.js", () => ({
  default: {
    findByIdAndUpdate: vi.fn(),
  },
}));

// Valid ObjectId string: LlmCall.userId casts it, and the mocked
// User.findByIdAndUpdate still receives it verbatim for assertions.
const USER_ID = new mongoose.Types.ObjectId().toString();

function buildRes() {
  const res = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

function buildReq(overrides = {}) {
  return {
    user: {
      _id: USER_ID,
      nativeLanguage: "English",
      learningLanguage: "French",
      flashcardUsage: { count: 0, lastDate: "", cards: [] },
      ...overrides,
    },
  };
}

function today() {
  return new Date().toISOString().split("T")[0];
}

// callModel validates LLM output against flashcardSetSchema, which fills in
// defaults for optional fields — so a minimal mocked card comes out normalized.
function normalizedCard(card) {
  return {
    romanization: "",
    exampleTarget: "",
    exampleNative: "",
    partOfSpeech: "",
    difficulty: "A1",
    ...card,
  };
}

describe("flashcard controller", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.OPENROUTER_API_KEY = "test-key";
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("serves the cached set for today without calling the API or consuming a quota slot", async () => {
    const req = buildReq({
      flashcardUsage: {
        count: 2,
        lastDate: today(),
        cards: [{ targetWord: "bonjour", category: "food" }],
        category: "food",
      },
    });
    const res = buildRes();

    await getFlashcards(req, res);

    expect(fetch).not.toHaveBeenCalled();
    expect(User.findByIdAndUpdate).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      flashcards: [{ targetWord: "bonjour", category: "food" }],
      remaining: 3,
    });
  });

  it("generates a new set and saves it when no cached cards exist for today", async () => {
    const req = buildReq();
    const res = buildRes();

    globalThis.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '{"flashcards":[{"nativeWord":"pain","targetWord":"bread","category":"food"}]}' } }],
      }),
    });

    await getFlashcards(req, res);

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(User.findByIdAndUpdate).toHaveBeenCalledWith(USER_ID, {
      flashcardUsage: {
        count: 1,
        lastDate: today(),
        cards: [normalizedCard({ nativeWord: "pain", targetWord: "bread", category: "food" })],
        category: expect.any(String),
      },
    });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      flashcards: [normalizedCard({ nativeWord: "pain", targetWord: "bread", category: "food" })],
      remaining: 4,
    });
  });

  it("falls back to the secondary model when the primary one fails", async () => {
    const req = buildReq();
    const res = buildRes();

    globalThis.fetch
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => "primary failed",
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: '{"flashcards":[{"nativeWord":"bonjour","targetWord":"hello","category":"greetings"}]}' } }],
        }),
      });

    await getNextFlashcards(req, res);

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[0][1].body).toContain("openai/gpt-4o-mini");
    expect(fetch.mock.calls[1][1].body).toContain("google/gemini-2.5-flash");
    expect(User.findByIdAndUpdate).toHaveBeenCalledWith(USER_ID, {
      flashcardUsage: {
        count: 1,
        lastDate: today(),
        cards: [normalizedCard({ nativeWord: "bonjour", targetWord: "hello", category: "greetings" })],
        category: expect.any(String),
      },
    });
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("treats schema-invalid LLM output as a failure and falls back", async () => {
    const req = buildReq();
    const res = buildRes();

    globalThis.fetch
      // Primary returns parseable JSON, but the card is missing targetWord —
      // schema validation must reject it and trigger the fallback model.
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: '{"flashcards":[{"nativeWord":"pain","category":"food"}]}' } }],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: '{"flashcards":[{"nativeWord":"pain","targetWord":"bread","category":"food"}]}' } }],
        }),
      });

    await getNextFlashcards(req, res);

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(User.findByIdAndUpdate).toHaveBeenCalledWith(USER_ID, {
      flashcardUsage: {
        count: 1,
        lastDate: today(),
        cards: [normalizedCard({ nativeWord: "pain", targetWord: "bread", category: "food" })],
        category: expect.any(String),
      },
    });
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("records an LlmCall with tokens, cost, and prompt version on success", async () => {
    const req = buildReq();
    const res = buildRes();

    globalThis.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '{"flashcards":[{"nativeWord":"pain","targetWord":"bread","category":"food"}]}' } }],
        usage: { prompt_tokens: 200, completion_tokens: 100 },
      }),
    });

    await getFlashcards(req, res);

    // logLlmCall is fire-and-forget, so poll for the insert to land. Filter
    // by this test's unique token count — stragglers from sibling tests have
    // no usage data, so they can't be confused with this doc.
    await vi.waitFor(async () => {
      const call = await LlmCall.findOne({ promptTokens: 200 });
      expect(call).toBeTruthy();
      expect(call.model).toBe("openai/gpt-4o-mini");
      expect(call.promptVersion).toBe(PROMPT_VERSION);
      expect(call.completionTokens).toBe(100);
      expect(call.costUsd).toBeGreaterThan(0);
      expect(call.fallbackUsed).toBe(false);
      expect(call.userId.toString()).toBe(USER_ID);
    });
  });

  it("records both the failed primary and the successful fallback call", async () => {
    const req = buildReq();
    const res = buildRes();

    globalThis.fetch
      .mockResolvedValueOnce({ ok: false, status: 500, text: async () => "primary failed" })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: '{"flashcards":[{"nativeWord":"pain","targetWord":"bread","category":"food"}]}' } }],
        }),
      });

    await getNextFlashcards(req, res);

    await vi.waitFor(async () => {
      const failed = await LlmCall.findOne({ success: false });
      const succeeded = await LlmCall.findOne({ success: true });
      expect(failed.model).toBe("openai/gpt-4o-mini");
      expect(failed.errorType).toBe("http_500");
      expect(failed.fallbackUsed).toBe(false);
      expect(succeeded.model).toBe("google/gemini-2.5-flash");
      expect(succeeded.fallbackUsed).toBe(true);
    });
  });

  it("records a cache-hit LlmCall when serving today's cached set", async () => {
    // Distinct user id so this test's cache-hit doc can't be confused with a
    // straggler insert from the other cached-set test in this file.
    const cacheUserId = new mongoose.Types.ObjectId().toString();
    const req = buildReq({
      _id: cacheUserId,
      flashcardUsage: { count: 2, lastDate: today(), cards: [{ targetWord: "bonjour" }], category: "food" },
    });
    const res = buildRes();

    await getFlashcards(req, res);

    expect(fetch).not.toHaveBeenCalled();
    await vi.waitFor(async () => {
      const call = await LlmCall.findOne({ cacheHit: true, userId: cacheUserId });
      expect(call).toBeTruthy();
      expect(call.model).toBe("(cache)");
      expect(call.success).toBe(true);
    });
  });

  it("still serves flashcards when observability logging fails", async () => {
    const createSpy = vi.spyOn(LlmCall, "create").mockRejectedValue(new Error("db down"));
    const req = buildReq();
    const res = buildRes();

    globalThis.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '{"flashcards":[{"nativeWord":"pain","targetWord":"bread","category":"food"}]}' } }],
      }),
    });

    await getFlashcards(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(createSpy).toHaveBeenCalled();
    createSpy.mockRestore();
  });
});
