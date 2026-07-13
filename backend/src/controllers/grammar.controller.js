import User from "../models/User.js";
import { explanationSchema } from "../lib/aiSchemas.js";
import { completeJSON } from "../lib/llm.js";
import { embedText } from "../lib/embeddings.js";
import { retrieveSimilarSentences } from "../lib/retrieval.js";
import { pairKey } from "../lib/langCodes.js";

const EXPLAIN_DAILY_LIMIT = 10;
const EXPLAIN_MODEL = "openai/gpt-4o-mini";
const FALLBACK_MODEL = "google/gemini-2.5-flash";
const CITATION_K = 5;

// Bump on every change to buildExplainPrompt (grammar has its own version
// track, separate from the flashcards prompt).
export const EXPLAIN_PROMPT_VERSION = "g1";

function buildExplainPrompt({ sentence, question, nativeLanguage, learningLanguage, examples }) {
  const exampleBlock = examples.length
    ? `\nSimilar example sentences from the Tatoeba corpus — ground your explanation in these where helpful:\n${examples
        .map((e, i) => `${i + 1}. "${e.targetText}" — "${e.nativeText}"`)
        .join("\n")}\n`
    : "";

  const questionBlock = question ? `\nTheir specific question: "${question}"` : "";

  return `You are a friendly, precise ${learningLanguage} grammar teacher helping a ${nativeLanguage}-speaking beginner (CEFR A1-A2).

The learner asks about this ${learningLanguage} sentence:
"${sentence}"${questionBlock}
${exampleBlock}
Explain how the sentence is built: word order, verb form/conjugation, articles/particles/prepositions, and anything a beginner would find surprising. Keep it under 180 words, in plain ${nativeLanguage}, defining any grammar term in a few words when first used.

Stay strictly on language learning. If the question asks for anything unrelated to this sentence or to learning ${learningLanguage}, briefly decline that part and explain the sentence instead.

Respond with a JSON object of exactly this shape and nothing else:
{ "explanation": "your explanation as plain text (short paragraphs or dash bullets separated by newlines)" }`;
}

// POST /api/ai/explain — grounded grammar explanation with Tatoeba citations.
export async function explainSentence(req, res) {
  try {
    // req.body validated by validateBody(explainRequestSchema)
    const { sentence, question } = req.body;
    const { nativeLanguage, learningLanguage } = req.user;

    if (!learningLanguage) {
      return res.status(400).json({ message: "Complete onboarding before using the grammar tutor" });
    }

    // Daily quota — same pattern as flashcards.
    const today = new Date().toISOString().split("T")[0];
    const usage = req.user.explainUsage || { count: 0, lastDate: "" };
    const currentCount = usage.lastDate === today ? usage.count : 0;
    if (currentCount >= EXPLAIN_DAILY_LIMIT) {
      return res.status(429).json({ message: "Daily explanation limit reached. Come back tomorrow!", remaining: 0 });
    }

    // Retrieval: top-k similar corpus sentences for the user's language pair.
    // Both steps degrade to "no citations" rather than failing the request.
    const pair = pairKey(learningLanguage, nativeLanguage);
    let citations = [];
    if (pair) {
      let queryVector = null;
      try {
        queryVector = await embedText(sentence);
      } catch (error) {
        console.error("[Grammar] Query embedding failed, continuing without citations:", error.message);
      }
      citations = await retrieveSimilarSentences({ pair, queryVector, k: CITATION_K });
    }

    const base = {
      feature: "grammar",
      prompt: buildExplainPrompt({ sentence, question, nativeLanguage, learningLanguage, examples: citations }),
      schema: explanationSchema,
      promptVersion: EXPLAIN_PROMPT_VERSION,
      userId: req.user._id,
      meta: { citationCount: citations.length },
    };

    let data;
    try {
      data = await completeJSON({ ...base, model: EXPLAIN_MODEL });
    } catch (primaryError) {
      console.error("[Grammar] Primary model failed, trying fallback:", primaryError.message);
      data = await completeJSON({ ...base, model: FALLBACK_MODEL, fallbackUsed: true });
    }

    await User.findByIdAndUpdate(req.user._id, {
      explainUsage: { count: currentCount + 1, lastDate: today },
    });

    res.status(200).json({
      explanation: data.explanation,
      citations, // [{ targetText, nativeText, tatoebaId }] — CC-BY, tatoeba.org
      remaining: EXPLAIN_DAILY_LIMIT - currentCount - 1,
    });
  } catch (error) {
    console.error("[Grammar] Error in explainSentence:", error.message);
    res.status(502).json({ message: "The grammar tutor is temporarily unavailable. Please try again shortly." });
  }
}
