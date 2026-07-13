import { describe, it, expect, afterEach } from "vitest";
import request from "supertest";
import app from "../app.js";
import LlmCall from "../models/LlmCall.js";

let ipCounter = 3000;
function freshIp() {
  ipCounter += 1;
  return `10.0.3.${ipCounter % 250}`;
}

async function createUser(email) {
  const agent = request.agent(app);
  await agent
    .post("/api/auth/signup")
    .set("X-Forwarded-For", freshIp())
    .send({ fullName: "Stats Tester", email, password: "correcthorse" });
  return agent;
}

const ORIGINAL_ADMIN_EMAILS = process.env.ADMIN_EMAILS;

describe("GET /api/admin/llm-stats", () => {
  afterEach(() => {
    if (ORIGINAL_ADMIN_EMAILS === undefined) {
      delete process.env.ADMIN_EMAILS;
    } else {
      process.env.ADMIN_EMAILS = ORIGINAL_ADMIN_EMAILS;
    }
  });

  it("rejects unauthenticated requests", async () => {
    const res = await request(app).get("/api/admin/llm-stats").set("X-Forwarded-For", freshIp());
    expect(res.status).toBe(401);
  });

  it("exposes isAdmin on /me for admin UI gating (true for admins, false otherwise)", async () => {
    process.env.ADMIN_EMAILS = "flagged@example.com";
    const adminAgent = await createUser("flagged@example.com");
    const regularAgent = await createUser("unflagged@example.com");

    const adminMe = await adminAgent.get("/api/auth/me").set("X-Forwarded-For", freshIp());
    const regularMe = await regularAgent.get("/api/auth/me").set("X-Forwarded-For", freshIp());

    expect(adminMe.body.isAdmin).toBe(true);
    expect(regularMe.body.isAdmin).toBe(false);
  });

  it("rejects a logged-in user who is not on the admin list", async () => {
    process.env.ADMIN_EMAILS = "someone-else@example.com";
    const agent = await createUser("regular@example.com");

    const res = await agent.get("/api/admin/llm-stats").set("X-Forwarded-For", freshIp());
    expect(res.status).toBe(403);
  });

  it("rejects everyone when ADMIN_EMAILS is unset", async () => {
    delete process.env.ADMIN_EMAILS;
    const agent = await createUser("noadmin@example.com");

    const res = await agent.get("/api/admin/llm-stats").set("X-Forwarded-For", freshIp());
    expect(res.status).toBe(403);
  });

  it("returns aggregated stats for an admin (email match is case-insensitive)", async () => {
    process.env.ADMIN_EMAILS = "other@example.com, Admin@Example.com";
    const agent = await createUser("admin@example.com");

    // Exact-count assertions below: clear any straggler fire-and-forget
    // inserts that may have landed after another file's cleanup.
    await LlmCall.deleteMany({});
    await LlmCall.create([
      { feature: "flashcards", model: "openai/gpt-4o-mini", latencyMs: 1000, success: true, costUsd: 0.001, promptTokens: 200, completionTokens: 100, promptVersion: "v1" },
      { feature: "flashcards", model: "openai/gpt-4o-mini", latencyMs: 2000, success: true, costUsd: 0.002, promptTokens: 300, completionTokens: 150, promptVersion: "v1" },
      { feature: "flashcards", model: "google/gemini-2.5-flash", latencyMs: 1500, success: true, fallbackUsed: true, costUsd: 0.001 },
      { feature: "flashcards", model: "openai/gpt-4o-mini", latencyMs: 800, success: false, errorType: "http_500" },
      { feature: "flashcards", model: "(cache)", latencyMs: 5, success: true, cacheHit: true },
    ]);

    const res = await agent.get("/api/admin/llm-stats").set("X-Forwarded-For", freshIp());

    expect(res.status).toBe(200);
    expect(res.body.totals.calls).toBe(5);
    expect(res.body.totals.cacheHits).toBe(1);
    expect(res.body.totals.failures).toBe(1);
    expect(res.body.totals.fallbacks).toBe(1);
    expect(res.body.totals.cacheHitRate).toBeCloseTo(0.2);

    const gptRow = res.body.byFeatureModel.find((r) => r.model === "openai/gpt-4o-mini");
    expect(gptRow.calls).toBe(3);
    expect(gptRow.successRate).toBeCloseTo(2 / 3);
    expect(gptRow.p50LatencyMs).toBeGreaterThanOrEqual(800);
    expect(gptRow.p95LatencyMs).toBeLessThanOrEqual(2000);
    expect(gptRow.promptTokens).toBe(500);

    expect(res.body.daily).toHaveLength(1);
    expect(res.body.daily[0].calls).toBe(5);
  });
});
