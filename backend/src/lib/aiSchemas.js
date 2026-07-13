import { z } from "zod";

// Shape of a single LLM-generated flashcard. Deliberately lenient on
// partOfSpeech/difficulty at runtime (a slightly off label shouldn't cost the
// user their generation — the fallback chain retries on hard failures only).
// The eval suite (Phase 3) applies a stricter variant of this schema.
export const flashcardSchema = z.object({
  nativeWord: z.string().trim().min(1),
  targetWord: z.string().trim().min(1),
  romanization: z.string().trim().catch("").default(""),
  exampleTarget: z.string().trim().catch("").default(""),
  exampleNative: z.string().trim().catch("").default(""),
  partOfSpeech: z.string().trim().catch("").default(""),
  difficulty: z.string().trim().catch("A1").default("A1"),
  category: z.string().trim().min(1),
});

export const flashcardSetSchema = z.object({
  flashcards: z.array(flashcardSchema).min(1).max(10),
});

// Body for POST /api/ai/study. targetLanguage is intentionally absent —
// the server takes it from req.user.learningLanguage, never from the client.
// The optional card-snapshot fields feed the revision deck (Phase 2.5).
export const studyEventSchema = z.object({
  targetWord: z.string().trim().min(1, "targetWord is required").max(100),
  nativeWord: z.string().trim().max(100).optional().default(""),
  category: z.string().trim().max(50).optional().default(""),
  knewIt: z.boolean().optional().default(false),
  exampleTarget: z.string().trim().max(300).optional(),
  exampleNative: z.string().trim().max(300).optional(),
  romanization: z.string().trim().max(100).optional(),
  partOfSpeech: z.string().trim().max(30).optional(),
});

// Body for POST /api/ai/review — one Leitner review result.
export const reviewResultSchema = z.object({
  targetWord: z.string().trim().min(1, "targetWord is required").max(100),
  correct: z.boolean(),
});
