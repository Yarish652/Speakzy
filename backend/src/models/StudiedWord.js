import mongoose from "mongoose";

// One document per (user, language, word). Study events upsert into this
// collection, which makes them idempotent and gives the RAG pipeline
// (see docs/AI_ROADMAP.md Phase 2) a server-side corpus of known words.
const studiedWordSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    // Display form as the model generated it ("Guten Tag").
    targetWord: { type: String, required: true, trim: true },
    // Normalized form used for dedupe ("guten tag").
    wordKey: { type: String, required: true },
    nativeWord: { type: String, default: "" },
    targetLanguage: { type: String, required: true, lowercase: true, trim: true },
    category: { type: String, default: "" },
    timesStudied: { type: Number, default: 0 },
    knewIt: { type: Number, default: 0 },
    // Card snapshot captured at study time so revision cards can show real
    // content (examples, romanization) without any regeneration.
    exampleTarget: { type: String, default: "" },
    exampleNative: { type: String, default: "" },
    romanization: { type: String, default: "" },
    partOfSpeech: { type: String, default: "" },
    // Leitner spaced repetition (docs/AI_ROADMAP.md Phase 2.5): box 1-5 with
    // exponentially growing review intervals. New words become due after the
    // box-1 interval (1 day) — you just studied them, no point reviewing now.
    box: { type: Number, default: 1, min: 1, max: 5 },
    nextReviewAt: { type: Date, default: () => new Date(Date.now() + 24 * 60 * 60 * 1000) },
    // Filled asynchronously in Phase 2 (vector for "targetWord — nativeWord").
    // select: false keeps the (large) vector out of ordinary queries.
    embedding: { type: [Number], default: undefined, select: false },
  },
  { timestamps: true }
);

studiedWordSchema.index({ userId: 1, targetLanguage: 1, wordKey: 1 }, { unique: true });
// getTodayStudyStats queries by user + updatedAt range.
studiedWordSchema.index({ userId: 1, updatedAt: -1 });
// getReviewCards queries by user + due date.
studiedWordSchema.index({ userId: 1, nextReviewAt: 1 });

const StudiedWord = mongoose.model("StudiedWord", studiedWordSchema);

export default StudiedWord;
