import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getFlashcards, getNextFlashcards } from "../controllers/ai.controller.js";
import User from "../models/User.js";

vi.mock("../models/User.js", () => ({
  default: {
    findByIdAndUpdate: vi.fn(),
  },
}));

function buildRes() {
  const res = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

function buildReq(overrides = {}) {
  return {
    user: {
      _id: "user-1",
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
    expect(User.findByIdAndUpdate).toHaveBeenCalledWith("user-1", {
      flashcardUsage: {
        count: 1,
        lastDate: today(),
        cards: [{ nativeWord: "pain", targetWord: "bread", category: "food" }],
        category: expect.any(String),
      },
    });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      flashcards: [{ nativeWord: "pain", targetWord: "bread", category: "food" }],
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
    expect(fetch.mock.calls[1][1].body).toContain("google/gemini-flash-1.5");
    expect(User.findByIdAndUpdate).toHaveBeenCalledWith("user-1", {
      flashcardUsage: {
        count: 1,
        lastDate: today(),
        cards: [{ nativeWord: "bonjour", targetWord: "hello", category: "greetings" }],
        category: expect.any(String),
      },
    });
    expect(res.status).toHaveBeenCalledWith(200);
  });
});
