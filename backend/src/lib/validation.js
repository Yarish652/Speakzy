import { z } from "zod";

export const signupSchema = z.object({
  fullName: z.string().trim().min(1, "Full name is required").max(100),
  email: z.string().trim().email("Invalid email format").max(254),
  password: z.string().min(6, "Password must be at least 6 characters").max(128),
});

export const loginSchema = z.object({
  email: z.string().trim().email("Invalid email format").max(254),
  password: z.string().min(1, "Password is required").max(128),
});

export const onboardSchema = z.object({
  fullName: z.string().trim().min(1, "Full name is required").max(100),
  bio: z.string().trim().max(500).optional().default(""),
  nativeLanguage: z.string().trim().min(1, "Native language is required").max(50),
  learningLanguage: z.string().trim().min(1, "Learning language is required").max(50),
  location: z.string().trim().min(1, "Location is required").max(100),
  profilePic: z.string().trim().url().optional().or(z.literal("")),
  gender: z.enum(["male", "female", "other"]).optional(),
});

// Generic middleware factory: validates req.body against a schema.
// On success, replaces req.body with the parsed/coerced data.
export function validateBody(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const firstIssue = result.error.issues[0];
      return res.status(400).json({
        message: firstIssue?.message || "Invalid request data",
        issues: result.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      });
    }
    req.body = result.data;
    next();
  };
}

// Validates that a route param looks like a Mongo ObjectId,
// preventing malformed/injected values from reaching queries.
const objectIdRegex = /^[0-9a-fA-F]{24}$/;
export function validateObjectIdParam(paramName) {
  return (req, res, next) => {
    const value = req.params[paramName];
    if (!objectIdRegex.test(value)) {
      return res.status(400).json({ message: `Invalid ${paramName}` });
    }
    next();
  };
}