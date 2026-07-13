import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import request from "supertest";
import app from "../app.js";
import User from "../models/User.js";
import GrammarSentence from "../models/GrammarSentence.js";
import LlmCall from "../models/LlmCall.js";
import { clearSentenceCorpusCache } from "../lib/retrieval.js";

// Deterministic vectors: the query embeds to [1, 0], so a corpus sentence
// stored with [1, 0] must rank above one stored with [0, 1].
vi.mock("../lib/embeddings.js", () => ({
  isEmbeddingsConfigured: () => true,
  embedText: vi.fn(async () => [1, 0]),
  embedTexts: vi.fn(async (texts) => texts.map(() => [1, 0])),
}));

let ipCounter = 5000;
function freshIp() {
  ipCounter += 1;
  return `10.0.5.${ipCounter % 250}`;
}

async function createOnboardedUser(email) {
  const agent = request.agent(app);
  await agent
    .post("/api/auth/signup")
    .set("X-Forwarded-For", freshIp())
    .send({ fullName: email.split("@")[0], email, password: "correcthorse" });

  await agent
    .post("/api/auth/onboarding")
    .set("X-Forwarded-For", freshIp())
    .send({
      fullName: email.split("@")[0],
      bio: "test bio",
      nativeLanguage: "english",
      learningLanguage: "french",
      location: "Test City",
    });

  const me = await agent.get("/api/auth/me").set("X-Forwarded-For", freshIp());
  return { agent, userId: me.body.user._id };
}

function mockExplanation(text = "The verb comes second in French declaratives.") {
  return {
    ok: true,
    json: async () => ({
      choices: [{ message: { content: JSON.stringify({ explanation: text }) } }],
      usage: { prompt_tokens: 300, completion_tokens: 120 },
    }),
  };
}

describe("POST /api/ai/explain", () => {
  let user;

  beforeEach(async () => {
    user = await createOnboardedUser("grammar@example.com");
    clearSentenceCorpusCache(); // corpus is re-seeded per test
    process.env.OPENROUTER_API_KEY = "test-key";
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  async function seedCorpus() {
    await GrammarSentence.create([
      { pair: "fra-eng", targetText: "Je mange du pain.", nativeText: "I eat bread.", tatoebaId: 1001, embedding: [1, 0] },
      { pair: "fra-eng", targetText: "Il pleut souvent.", nativeText: "It often rains.", tatoebaId: 1002, embedding: [0, 1] },
      // Wrong pair must never be cited.
      { pair: "spa-eng", targetText: "Como pan.", nativeText: "I eat bread.", tatoebaId: 2001, embedding: [1, 0] },
    ]);
  }

  it("returns a grounded explanation with citations from the user's language pair", async () => {
    await seedCorpus();
    globalThis.fetch.mockResolvedValueOnce(mockExplanation());

    const res = await user.agent
      .post("/api/ai/explain")
      .set("X-Forwarded-For", freshIp())
      .send({ sentence: "Je bois de l'eau." });

    expect(res.status).toBe(200);
    expect(res.body.explanation).toContain("verb");
    expect(res.body.remaining).toBe(9);

    const citedIds = res.body.citations.map((c) => c.tatoebaId);
    expect(citedIds).toContain(1001);
    expect(citedIds).not.toContain(2001); // other language pair excluded
    expect(citedIds[0]).toBe(1001); // most similar first

    // The retrieved examples must actually be in the prompt (grounding).
    const promptSent = JSON.parse(fetch.mock.calls[0][1].body).messages[0].content;
    expect(promptSent).toContain("Je mange du pain.");
  });

  it("works without a corpus: empty citations, explanation still returned", async () => {
    globalThis.fetch.mockResolvedValueOnce(mockExplanation());

    const res = await user.agent
      .post("/api/ai/explain")
      .set("X-Forwarded-For", freshIp())
      .send({ sentence: "Je bois de l'eau." });

    expect(res.status).toBe(200);
    expect(res.body.citations).toEqual([]);
  });

  it("enforces the daily quota with 429", async () => {
    const today = new Date().toISOString().split("T")[0];
    await User.updateOne({ _id: user.userId }, { explainUsage: { count: 10, lastDate: today } });

    const res = await user.agent
      .post("/api/ai/explain")
      .set("X-Forwarded-For", freshIp())
      .send({ sentence: "Je bois de l'eau." });

    expect(res.status).toBe(429);
    expect(fetch).not.toHaveBeenCalled(); // no model spend once capped
  });

  it("increments the quota counter on success", async () => {
    globalThis.fetch.mockResolvedValue(mockExplanation());

    await user.agent.post("/api/ai/explain").set("X-Forwarded-For", freshIp()).send({ sentence: "Un." });
    const res = await user.agent
      .post("/api/ai/explain")
      .set("X-Forwarded-For", freshIp())
      .send({ sentence: "Deux." });

    expect(res.body.remaining).toBe(8);
  });

  it("rejects oversized input (prompt-injection surface control)", async () => {
    const res = await user.agent
      .post("/api/ai/explain")
      .set("X-Forwarded-For", freshIp())
      .send({ sentence: "a".repeat(301) });
    expect(res.status).toBe(400);

    const res2 = await user.agent
      .post("/api/ai/explain")
      .set("X-Forwarded-For", freshIp())
      .send({ sentence: "Je bois.", question: "q".repeat(201) });
    expect(res2.status).toBe(400);
  });

  it("rejects unauthenticated requests", async () => {
    const res = await request(app)
      .post("/api/ai/explain")
      .set("X-Forwarded-For", freshIp())
      .send({ sentence: "Je bois." });
    expect(res.status).toBe(401);
  });

  it("logs the call under feature 'grammar' with the citation count in meta", async () => {
    await seedCorpus();
    globalThis.fetch.mockResolvedValueOnce(mockExplanation());

    await user.agent
      .post("/api/ai/explain")
      .set("X-Forwarded-For", freshIp())
      .send({ sentence: "Je bois de l'eau." });

    await vi.waitFor(async () => {
      const call = await LlmCall.findOne({ feature: "grammar" });
      expect(call).toBeTruthy();
      expect(call.promptVersion).toBe("g1");
      expect(call.meta.citationCount).toBe(2); // both fra-eng docs retrieved
      expect(call.success).toBe(true);
    });
  });
});
