import rateLimit from "express-rate-limit";

// Strict limiter for login � the main brute-force target.
// 10 attempts per 15 minutes per IP.
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true, // return rate limit info in RateLimit-* headers
  legacyHeaders: false,
  message: { message: "Too many login attempts. Please try again in a few minutes." },
  // Skip counting successful logins so real users don't get penalized
  // for a few earlier typos followed by a correct password.
  skipSuccessfulRequests: true,
});

// Slightly looser limiter for signup � prevents automated account creation spam.
export const signupLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many accounts created from this network. Please try again later." },
});

// General-purpose limiter for the rest of auth routes (logout, /me, onboarding)
// — generous, just a backstop against abuse/scripted hammering.
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many requests. Please slow down." },
});