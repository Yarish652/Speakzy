import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import app from "../app.js";
import StudiedWord from "../models/StudiedWord.js";

let ipCounter = 2000;
function freshIp() {
  ipCounter += 1;
  return `10.0.2.${ipCounter % 250}`;
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

describe("POST /api/ai/study", () => {
  let user;

  beforeEach(async () => {
    user = await createOnboardedUser("study@example.com");
  });

  it("records a study event and creates one StudiedWord doc", async () => {
    const res = await user.agent
      .post("/api/ai/study")
      .set("X-Forwarded-For", freshIp())
      .send({ targetWord: "Bonjour", nativeWord: "Hello", category: "greetings" });

    expect(res.status).toBe(200);
    expect(res.body.word.timesStudied).toBe(1);

    const docs = await StudiedWord.find({ userId: user.userId });
    expect(docs).toHaveLength(1);
    expect(docs[0].wordKey).toBe("bonjour"); // normalized
    expect(docs[0].targetWord).toBe("Bonjour"); // display case preserved
    expect(docs[0].targetLanguage).toBe("french"); // from the user, not the client
  });

  it("dedupes case-insensitively and increments timesStudied instead of duplicating", async () => {
    await user.agent
      .post("/api/ai/study")
      .set("X-Forwarded-For", freshIp())
      .send({ targetWord: "Bonjour" });
    const res = await user.agent
      .post("/api/ai/study")
      .set("X-Forwarded-For", freshIp())
      .send({ targetWord: "bonjour" });

    expect(res.body.word.timesStudied).toBe(2);
    const docs = await StudiedWord.find({ userId: user.userId });
    expect(docs).toHaveLength(1);
  });

  it("counts 'I knew it' separately from reveals", async () => {
    await user.agent
      .post("/api/ai/study")
      .set("X-Forwarded-For", freshIp())
      .send({ targetWord: "merci" });
    const res = await user.agent
      .post("/api/ai/study")
      .set("X-Forwarded-For", freshIp())
      .send({ targetWord: "merci", knewIt: true });

    expect(res.body.word.timesStudied).toBe(1);
    expect(res.body.word.knewIt).toBe(1);
  });

  it("rejects an empty targetWord", async () => {
    const res = await user.agent
      .post("/api/ai/study")
      .set("X-Forwarded-For", freshIp())
      .send({ targetWord: "   " });

    expect(res.status).toBe(400);
  });

  it("rejects unauthenticated requests", async () => {
    const res = await request(app)
      .post("/api/ai/study")
      .set("X-Forwarded-For", freshIp())
      .send({ targetWord: "bonjour" });

    expect(res.status).toBe(401);
  });
});

describe("GET /api/ai/study/today", () => {
  it("returns the distinct words studied today", async () => {
    const user = await createOnboardedUser("today@example.com");

    for (const word of ["un", "deux", "Deux"]) {
      await user.agent
        .post("/api/ai/study")
        .set("X-Forwarded-For", freshIp())
        .send({ targetWord: word });
    }

    const res = await user.agent.get("/api/ai/study/today").set("X-Forwarded-For", freshIp());

    expect(res.status).toBe(200);
    expect(res.body.count).toBe(2); // "deux" studied twice = one word
    expect(res.body.wordKeys.sort()).toEqual(["deux", "un"]);
  });

  it("does not leak another user's words", async () => {
    const alice = await createOnboardedUser("alice-study@example.com");
    const bob = await createOnboardedUser("bob-study@example.com");

    await alice.agent
      .post("/api/ai/study")
      .set("X-Forwarded-For", freshIp())
      .send({ targetWord: "bonjour" });

    const res = await bob.agent.get("/api/ai/study/today").set("X-Forwarded-For", freshIp());
    expect(res.body.count).toBe(0);
  });
});
