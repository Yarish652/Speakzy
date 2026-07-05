import { describe, it, expect } from "vitest";
import { signupSchema, loginSchema, onboardSchema } from "./validation.js";

describe("signupSchema", () => {
  it("accepts valid signup data", () => {
    const result = signupSchema.safeParse({
      fullName: "Ada Lovelace",
      email: "ada@example.com",
      password: "correcthorse",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a missing password", () => {
    const result = signupSchema.safeParse({
      fullName: "Ada Lovelace",
      email: "ada@example.com",
    });
    expect(result.success).toBe(false);
  });

  it("rejects passwords under 6 characters", () => {
    const result = signupSchema.safeParse({
      fullName: "Ada",
      email: "ada@example.com",
      password: "abc",
    });
    expect(result.success).toBe(false);
  });

  it("rejects malformed email addresses", () => {
    const result = signupSchema.safeParse({
      fullName: "Ada",
      email: "not-an-email",
      password: "correcthorse",
    });
    expect(result.success).toBe(false);
  });

  it("rejects NoSQL-injection-style operator objects instead of strings", () => {
    // Regression test for the injection fix: { "$ne": null } must never
    // reach a Mongo query as a value — zod must reject it at the boundary.
    const result = signupSchema.safeParse({
      fullName: "Ada",
      email: { $ne: null },
      password: { $ne: null },
    });
    expect(result.success).toBe(false);
  });

  it("trims whitespace from fullName and email", () => {
    const result = signupSchema.safeParse({
      fullName: "  Ada Lovelace  ",
      email: "  ada@example.com  ",
      password: "correcthorse",
    });
    expect(result.success).toBe(true);
    expect(result.data.fullName).toBe("Ada Lovelace");
    expect(result.data.email).toBe("ada@example.com");
  });
});

describe("loginSchema", () => {
  it("rejects operator-object injection attempts", () => {
    const result = loginSchema.safeParse({
      email: { $gt: "" },
      password: { $gt: "" },
    });
    expect(result.success).toBe(false);
  });

  it("accepts valid credentials shape", () => {
    const result = loginSchema.safeParse({
      email: "ada@example.com",
      password: "anything",
    });
    expect(result.success).toBe(true);
  });
});

describe("onboardSchema", () => {
  it("defaults bio to an empty string when omitted", () => {
    const result = onboardSchema.safeParse({
      fullName: "Ada",
      nativeLanguage: "english",
      learningLanguage: "french",
      location: "London",
    });
    expect(result.success).toBe(true);
    expect(result.data.bio).toBe("");
  });

  it("rejects an invalid gender value", () => {
    const result = onboardSchema.safeParse({
      fullName: "Ada",
      nativeLanguage: "english",
      learningLanguage: "french",
      location: "London",
      gender: "robot",
    });
    expect(result.success).toBe(false);
  });
});