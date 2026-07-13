import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import app from "../app.js";
import StudiedWord from "../models/StudiedWord.js";
import LlmCall from "../models/LlmCall.js";

let ipCounter = 4000;
function freshIp() {
  ipCounter += 1;
  return `10.0.4.${ipCounter % 250}`;
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

function makeDue(userId, targetWord, extra = {}) {
  return StudiedWord.create({
    userId,
    targetWord,
    wordKey: targetWord.toLowerCase(),
    targetLanguage: "french",
    nativeWord: `en-${targetWord}`,
    nextReviewAt: new Date(Date.now() - 60 * 1000), // due a minute ago
    ...extra,
  });
}

describe("GET /api/ai/review", () => {
  let user;

  beforeEach(async () => {
    user = await createOnboardedUser("review@example.com");
  });

  it("returns only due cards, weakest box first, with the due count", async () => {
    await makeDue(user.userId, "pain", { box: 3 });
    await makeDue(user.userId, "eau", { box: 1 });
    // Not due: freshly created words default to nextReviewAt = +1 day.
    await StudiedWord.create({
      userId: user.userId,
      targetWord: "merci",
      wordKey: "merci",
      targetLanguage: "french",
    });

    const res = await user.agent.get("/api/ai/review").set("X-Forwarded-For", freshIp());

    expect(res.status).toBe(200);
    expect(res.body.dueCount).toBe(2);
    expect(res.body.cards.map((c) => c.targetWord)).toEqual(["eau", "pain"]); // box 1 first
  });

  it("includes the stored card snapshot", async () => {
    await makeDue(user.userId, "pain", {
      exampleTarget: "Je mange du pain.",
      exampleNative: "I eat bread.",
      romanization: "",
      partOfSpeech: "noun",
    });

    const res = await user.agent.get("/api/ai/review").set("X-Forwarded-For", freshIp());
    expect(res.body.cards[0].exampleTarget).toBe("Je mange du pain.");
    expect(res.body.cards[0].partOfSpeech).toBe("noun");
  });

  it("rejects unauthenticated requests", async () => {
    const res = await request(app).get("/api/ai/review").set("X-Forwarded-For", freshIp());
    expect(res.status).toBe(401);
  });
});

describe("POST /api/ai/review", () => {
  let user;

  beforeEach(async () => {
    user = await createOnboardedUser("review-post@example.com");
  });

  it("moves a correct answer up one box and schedules a longer interval", async () => {
    await makeDue(user.userId, "pain", { box: 2 });

    const res = await user.agent
      .post("/api/ai/review")
      .set("X-Forwarded-For", freshIp())
      .send({ targetWord: "pain", correct: true });

    expect(res.status).toBe(200);
    expect(res.body.word.box).toBe(3);

    const doc = await StudiedWord.findOne({ userId: user.userId, wordKey: "pain" });
    // Box 3 interval = 4 days.
    const expectedMs = 4 * 24 * 60 * 60 * 1000;
    const deltaMs = new Date(doc.nextReviewAt).getTime() - Date.now();
    expect(deltaMs).toBeGreaterThan(expectedMs - 60 * 1000);
    expect(deltaMs).toBeLessThan(expectedMs + 60 * 1000);
    expect(doc.knewIt).toBe(1);
    expect(doc.timesStudied).toBe(1);
  });

  it("caps the box at 5", async () => {
    await makeDue(user.userId, "pain", { box: 5 });

    const res = await user.agent
      .post("/api/ai/review")
      .set("X-Forwarded-For", freshIp())
      .send({ targetWord: "pain", correct: true });

    expect(res.body.word.box).toBe(5);
  });

  it("sends a wrong answer back to box 1 for tomorrow", async () => {
    await makeDue(user.userId, "pain", { box: 4 });

    const res = await user.agent
      .post("/api/ai/review")
      .set("X-Forwarded-For", freshIp())
      .send({ targetWord: "pain", correct: false });

    expect(res.body.word.box).toBe(1);
    const doc = await StudiedWord.findOne({ userId: user.userId, wordKey: "pain" });
    const deltaMs = new Date(doc.nextReviewAt).getTime() - Date.now();
    expect(deltaMs).toBeLessThan(24 * 60 * 60 * 1000 + 60 * 1000); // ~1 day
    expect(doc.knewIt).toBe(0);
  });

  it("404s for a word not in the study history", async () => {
    const res = await user.agent
      .post("/api/ai/review")
      .set("X-Forwarded-For", freshIp())
      .send({ targetWord: "unknown", correct: true });
    expect(res.status).toBe(404);
  });

  it("400s on a malformed body", async () => {
    const res = await user.agent
      .post("/api/ai/review")
      .set("X-Forwarded-For", freshIp())
      .send({ targetWord: "pain" }); // missing `correct`
    expect(res.status).toBe(400);
  });

  it("creates no LlmCall documents (revision must be LLM-free)", async () => {
    await makeDue(user.userId, "pain");
    await LlmCall.deleteMany({});

    await user.agent.get("/api/ai/review").set("X-Forwarded-For", freshIp());
    await user.agent
      .post("/api/ai/review")
      .set("X-Forwarded-For", freshIp())
      .send({ targetWord: "pain", correct: true });

    expect(await LlmCall.countDocuments()).toBe(0);
  });
});
