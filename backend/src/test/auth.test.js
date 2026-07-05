import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import app from "../app.js";

let ipCounter = 0;
function freshIp() {
  ipCounter += 1;
  return `10.0.0.${ipCounter % 250}`;
}

describe("POST /api/auth/signup", () => {
  it("creates a user and never returns the password hash", async () => {
    const res = await request(app)
      .post("/api/auth/signup")
      .set("X-Forwarded-For", freshIp())
      .send({ fullName: "Ada Lovelace", email: "ada@example.com", password: "correcthorse" });

    expect(res.status).toBe(201);
    expect(res.body.user).toBeDefined();
    expect(res.body.user.password).toBeUndefined(); // regression test for the leak fix
    expect(res.body.user.email).toBe("ada@example.com");
  });

  it("rejects a duplicate email", async () => {
    const ip = freshIp();
    await request(app)
      .post("/api/auth/signup")
      .set("X-Forwarded-For", ip)
      .send({ fullName: "Ada", email: "dupe@example.com", password: "correcthorse" });

    const res = await request(app)
      .post("/api/auth/signup")
      .set("X-Forwarded-For", ip)
      .send({ fullName: "Ada Again", email: "dupe@example.com", password: "correcthorse" });

    expect(res.status).toBe(400);
  });

  it("rejects a NoSQL-injection-style payload instead of crashing", async () => {
    const res = await request(app)
      .post("/api/auth/signup")
      .set("X-Forwarded-For", freshIp())
      .send({ fullName: "Attacker", email: { $ne: null }, password: { $ne: null } });

    expect(res.status).toBe(400);
  });
});

describe("POST /api/auth/login", () => {
  const credentials = { email: "login-test@example.com", password: "correcthorse" };

  beforeEach(async () => {
    await request(app)
      .post("/api/auth/signup")
      .set("X-Forwarded-For", freshIp())
      .send({ fullName: "Login Tester", ...credentials });
  });

  it("logs in with correct credentials and sets a cookie, without leaking the password", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .set("X-Forwarded-For", freshIp())
      .send(credentials);

    expect(res.status).toBe(200);
    expect(res.headers["set-cookie"]).toBeDefined();
    expect(res.body.user.password).toBeUndefined();
  });

  it("rejects an incorrect password", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .set("X-Forwarded-For", freshIp())
      .send({ email: credentials.email, password: "wrongpassword" });

    expect(res.status).toBe(401);
  });

  it("rejects a NoSQL-injection-style login attempt", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .set("X-Forwarded-For", freshIp())
      .send({ email: { $ne: null }, password: { $ne: null } });

    expect(res.status).toBe(400);
  });
});

describe("GET /api/auth/me", () => {
  it("rejects requests with no auth cookie", async () => {
    const res = await request(app).get("/api/auth/me").set("X-Forwarded-For", freshIp());
    expect(res.status).toBe(401);
  });
});

describe("login rate limiting", () => {
  it("blocks after repeated failed attempts from the same IP", async () => {
    const ip = "10.0.0.99"; // fixed on purpose — this test intentionally exhausts the limiter
    const email = "ratelimit-test@example.com";

    await request(app)
      .post("/api/auth/signup")
      .set("X-Forwarded-For", freshIp())
      .send({ fullName: "Rate Limit Test", email, password: "correcthorse" });

    let lastStatus;
    for (let i = 0; i < 11; i++) {
      const res = await request(app)
        .post("/api/auth/login")
        .set("X-Forwarded-For", ip)
        .send({ email, password: "wrongpassword" });
      lastStatus = res.status;
    }

    expect(lastStatus).toBe(429);
  });
});