import mongoose from "mongoose";

// One document per LLM interaction (including cache hits, recorded with
// model "(cache)"). Powers the /api/admin/llm-stats dashboard: latency
// percentiles, fallback rate, cache-hit rate, and estimated spend.
const llmCallSchema = new mongoose.Schema(
  {
    feature: { type: String, required: true, index: true }, // "flashcards" | "grammar" | "eval"
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    model: { type: String, required: true },
    promptVersion: { type: String, default: "" },
    latencyMs: { type: Number, required: true },
    promptTokens: { type: Number, default: 0 },
    completionTokens: { type: Number, default: 0 },
    costUsd: { type: Number, default: 0 },
    fallbackUsed: { type: Boolean, default: false },
    cacheHit: { type: Boolean, default: false },
    success: { type: Boolean, required: true },
    errorType: { type: String, default: "" },
    meta: { type: mongoose.Schema.Types.Mixed },
  },
  { timestamps: true }
);

// Observability data, not user data: expire after 90 days.
llmCallSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 90 });

const LlmCall = mongoose.model("LlmCall", llmCallSchema);

export default LlmCall;
