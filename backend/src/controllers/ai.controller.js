import User from "../models/User.js";
import StudiedWord from "../models/StudiedWord.js";
import { flashcardSetSchema } from "../lib/aiSchemas.js";
import { completeJSON, logLlmCall } from "../lib/llm.js";
import { embedText } from "../lib/embeddings.js";
import { retrieveRelatedKnownWords, normalizeWord } from "../lib/retrieval.js";

const DAILY_LIMIT = 5;

// Most recent studied words sent to the model as a do-not-repeat list.
// Capped to bound prompt size (100 words is roughly 200-400 tokens).
const EXCLUDE_LIMIT = 100;

// Known words retrieved per generation to weave into example sentences.
const RETRIEVE_K = 8;

// Bump on every change to buildPrompt. Logged with each LlmCall so the
// eval suite (Phase 3) can compare quality across prompt versions.
// v2: personalization — exclusion list + known-word weaving (RAG Phase 2).
export const PROMPT_VERSION = "v2";
const CATEGORIES = [
  "food", "travel", "family", "university", "shopping",
  "work", "numbers", "greetings", "emotions", "home",
];

const PRIMARY_MODEL = "openai/gpt-4o-mini";
// gemini-flash-1.5 was delisted from OpenRouter (caught by the eval suite's
// judge run 2026-07-13 — the fallback had been silently 404ing). Verify
// replacements against https://openrouter.ai/api/v1/models, not memory.
const FALLBACK_MODEL = "google/gemini-2.5-flash";

function buildPrompt(category, nativeLanguage, learningLanguage, personalization = {}) {
  const { excludeWords = [], knownWords = [] } = personalization;

  // Personalization rules are injected into the rules block (not appended at
  // the end) so they don't weaken the JSON-format instructions that close
  // the prompt.
  const exclusionRule = excludeWords.length
    ? `\n- The learner has ALREADY STUDIED these ${learningLanguage} words — do NOT use any of them as a targetWord: ${excludeWords.join(", ")}`
    : "";
  const weaveRule = knownWords.length
    ? `\n- Where natural, reuse a few of these words the learner already knows inside the exampleTarget sentences, so new vocabulary appears in familiar context: ${knownWords.join(", ")}`
    : "";

  return `Generate exactly 5 beginner (A1) vocabulary flashcards about the theme "${category}" for a ${nativeLanguage} speaker learning ${learningLanguage}.

Rules:
- All 5 cards must be about "${category}"
- High-frequency, everyday vocabulary only
- Natural, conversational example sentences
- Only one primary meaning per word
- ACTIVE RECALL format: nativeWord is what the user already knows, targetWord is what they are learning${exclusionRule}${weaveRule}

Respond with a JSON object of exactly this shape and nothing else:
{
  "flashcards": [
    {
      "nativeWord": "the word in ${nativeLanguage}",
      "targetWord": "the word in ${learningLanguage}",
      "romanization": "phonetic romanization only if ${learningLanguage} uses a non-Latin script (Japanese→romaji, Chinese→pinyin, Korean→revised romanization, Arabic/Hindi/Russian/Greek/Thai→standard transliteration). Use empty string \"\" for Latin-script languages",
      "exampleTarget": "a short natural sentence using targetWord in ${learningLanguage}",
      "exampleNative": "the ${nativeLanguage} translation of that sentence",
      "partOfSpeech": "noun | verb | adjective | adverb | phrase",
      "difficulty": "A1",
      "category": "${category}"
    }
  ]
}
Return exactly 5 objects in the array.`;
}

// All model I/O goes through lib/llm.js completeJSON, which handles the
// OpenRouter call, JSON parsing, schema validation, and LlmCall logging.
// Exported for the eval suite (backend/evals), which drives this exact
// pipeline against a golden dataset.
export async function generateFlashcards(category, nativeLanguage, learningLanguage, userId, personalization = {}, meta = null) {
  const base = {
    feature: "flashcards",
    prompt: buildPrompt(category, nativeLanguage, learningLanguage, personalization),
    schema: flashcardSetSchema,
    promptVersion: PROMPT_VERSION,
    userId,
    meta,
  };
  try {
    const data = await completeJSON({ ...base, model: PRIMARY_MODEL });
    return data.flashcards;
  } catch (primaryError) {
    console.error("[AI] Primary model failed, trying fallback:", primaryError.message);
    try {
      const data = await completeJSON({ ...base, model: FALLBACK_MODEL, fallbackUsed: true });
      return data.flashcards;
    } catch (fallbackError) {
      console.error("[AI] Fallback model also failed:", fallbackError.message);
      throw new Error("AI generation failed on both primary and fallback models");
    }
  }
}

// Category query vectors never change, so successful embeddings are cached
// for the process lifetime. Failures are NOT cached — a transient embedding
// outage shouldn't disable retrieval until the next restart.
const categoryVectorCache = new Map();
async function getCategoryVector(category) {
  if (categoryVectorCache.has(category)) return categoryVectorCache.get(category);
  try {
    const vector = await embedText(`${category} vocabulary`);
    if (vector) categoryVectorCache.set(category, vector);
    return vector;
  } catch (error) {
    console.error("[RAG] Category embedding failed:", error.message);
    return null;
  }
}

async function generateAndSaveNewSet(user) {
  const today = new Date().toISOString().split("T")[0];
  const usage = user.flashcardUsage || { count: 0, lastDate: "" };
  const isToday = usage.lastDate === today;
  const currentCount = isToday ? usage.count : 0;

  if (currentCount >= DAILY_LIMIT) {
    return { limitReached: true, remaining: 0 };
  }

  const category = CATEGORIES[Math.floor(Math.random() * CATEGORIES.length)];
  const { learningLanguage, nativeLanguage } = user;
  const targetLanguage = (learningLanguage || "").toLowerCase().trim();

  // --- RAG personalization (docs/AI_ROADMAP.md Phase 2) ---
  // Exclusion list: exact do-not-repeat words (no vectors needed).
  const studied = await StudiedWord.find({ userId: user._id, targetLanguage })
    .sort({ updatedAt: -1 })
    .limit(EXCLUDE_LIMIT)
    .select("targetWord");
  const excludeWords = studied.map((w) => w.targetWord);
  const excludeKeys = new Set(excludeWords.map(normalizeWord));

  // Retrieval: known words semantically related to the category, woven into
  // example sentences (comprehensible input). Empty on cold start or when
  // embeddings aren't configured — generation still works.
  const queryVector = await getCategoryVector(category);
  const knownWords = await retrieveRelatedKnownWords({
    userId: user._id,
    targetLanguage,
    queryVector,
    k: RETRIEVE_K,
  });

  const personalization = { excludeWords, knownWords };
  const meta = { excludedCount: excludeWords.length, retrievedCount: knownWords.length };

  let flashcards = await generateFlashcards(
    category, nativeLanguage, learningLanguage, user._id, personalization, meta
  );

  // Post-filter: never trust the model to respect the exclusion list.
  let kept = flashcards.filter((card) => !excludeKeys.has(normalizeWord(card.targetWord)));
  const dropped = flashcards.length - kept.length;

  if (dropped > 0 && kept.length < 5) {
    console.warn(`[RAG] Post-filter dropped ${dropped} already-studied card(s); retrying once for replacements`);
    try {
      const retryCards = await generateFlashcards(
        category, nativeLanguage, learningLanguage, user._id,
        // Also exclude everything just generated so the retry can't repeat it.
        { excludeWords: excludeWords.concat(flashcards.map((c) => c.targetWord)), knownWords },
        { ...meta, retry: true, droppedFromPrevious: dropped }
      );
      const seen = new Set(kept.map((card) => normalizeWord(card.targetWord)));
      for (const card of retryCards) {
        const key = normalizeWord(card.targetWord);
        if (!excludeKeys.has(key) && !seen.has(key)) {
          kept.push(card);
          seen.add(key);
        }
        if (kept.length >= 5) break;
      }
    } catch (retryError) {
      console.error("[RAG] Replacement retry failed, serving filtered set:", retryError.message);
    }
  }

  // Last resort: reviewing a studied word beats serving an empty set.
  flashcards = kept.length > 0 ? kept.slice(0, 5) : flashcards;

  const newCount = currentCount + 1;
  await User.findByIdAndUpdate(user._id, {
    flashcardUsage: { count: newCount, lastDate: today, cards: flashcards, category },
  });

  return { flashcards, remaining: DAILY_LIMIT - newCount };
}

export async function getFlashcards(req, res) {
  const started = Date.now();
  try {
    const today = new Date().toISOString().split("T")[0];
    const usage = req.user.flashcardUsage || { count: 0, lastDate: "", cards: [] };
    const isToday = usage.lastDate === today;

    if (isToday && Array.isArray(usage.cards) && usage.cards.length > 0) {
      // Served from the DB cache — no model call. Recorded so the admin
      // dashboard can report cache-hit rate alongside real generations.
      logLlmCall({
        feature: "flashcards",
        userId: req.user._id,
        model: "(cache)",
        promptVersion: PROMPT_VERSION,
        latencyMs: Date.now() - started,
        cacheHit: true,
        success: true,
      });

      return res.status(200).json({
        flashcards: usage.cards,
        remaining: Math.max(DAILY_LIMIT - usage.count, 0),
      });
    }

    const result = await generateAndSaveNewSet(req.user);
    if (result.limitReached) {
      return res.status(429).json({ message: "Daily limit reached. Come back tomorrow!", remaining: 0 });
    }
    res.status(200).json(result);
  } catch (error) {
    console.error("[AI] Error in getFlashcards:", error.message);
    res.status(502).json({ message: "AI service is temporarily unavailable. Please try again shortly." });
  }
}

export async function getNextFlashcards(req, res) {
  try {
    const result = await generateAndSaveNewSet(req.user);
    if (result.limitReached) {
      return res.status(429).json({ message: "Daily limit reached. Come back tomorrow!", remaining: 0 });
    }
    res.status(200).json(result);
  } catch (error) {
    console.error("[AI] Error in getNextFlashcards:", error.message);
    res.status(502).json({ message: "AI service is temporarily unavailable. Please try again shortly." });
  }
}

// Records that the user engaged with a word (revealed it, or marked "I knew
// it"). Upserts into StudiedWord keyed by (user, language, normalized word),
// so repeat events increment counters instead of creating duplicates. This
// collection is also the retrieval corpus for personalized generation
// (docs/AI_ROADMAP.md Phase 2).
export async function recordStudyEvent(req, res) {
  try {
    // req.body validated by validateBody(studyEventSchema)
    const { targetWord, nativeWord, category, knewIt, ...snapshot } = req.body;

    const targetLanguage = (req.user.learningLanguage || "").toLowerCase().trim();
    if (!targetLanguage) {
      return res.status(400).json({ message: "Complete onboarding before recording study progress" });
    }

    // Card-snapshot fields are only $set when actually provided, so a later
    // bare event (no card data) can't blank out a stored example sentence.
    const providedSnapshot = Object.fromEntries(
      Object.entries(snapshot).filter(([, value]) => value !== undefined && value !== "")
    );

    const filter = { userId: req.user._id, targetLanguage, wordKey: targetWord.toLowerCase() };
    const update = {
      $set: { targetWord, nativeWord, category, ...providedSnapshot },
      $inc: knewIt ? { knewIt: 1 } : { timesStudied: 1 },
    };

    let word;
    try {
      word = await StudiedWord.findOneAndUpdate(filter, update, { upsert: true, new: true })
        .select("+embedding");
    } catch (error) {
      // Two concurrent upserts for a brand-new word can race; the loser gets
      // a duplicate-key error. One retry hits the now-existing doc.
      if (error.code !== 11000) throw error;
      word = await StudiedWord.findOneAndUpdate(filter, update, { upsert: true, new: true })
        .select("+embedding");
    }

    // Backfill the word's vector for RAG retrieval — fire-and-forget, and a
    // no-op when embeddings aren't configured (embedText returns null).
    if (!word.embedding || word.embedding.length === 0) {
      embedText(`${word.targetWord} - ${word.nativeWord || ""}`)
        .then((vector) => vector && StudiedWord.updateOne({ _id: word._id }, { $set: { embedding: vector } }))
        .catch((error) => console.error("[RAG] Embedding backfill failed:", error.message));
    }

    res.status(200).json({
      success: true,
      word: { targetWord: word.targetWord, timesStudied: word.timesStudied, knewIt: word.knewIt },
    });
  } catch (error) {
    console.error("[AI] Error in recordStudyEvent:", error.message);
    res.status(500).json({ message: "Internal Server Error" });
  }
}

// Distinct words the user engaged with since UTC midnight — powers the
// "Words studied" stat, account-wide instead of per-browser. UTC matches the
// existing flashcardUsage.lastDate day-boundary convention.
export async function getTodayStudyStats(req, res) {
  try {
    const startOfToday = new Date();
    startOfToday.setUTCHours(0, 0, 0, 0);

    const words = await StudiedWord.find({
      userId: req.user._id,
      updatedAt: { $gte: startOfToday },
    }).select("wordKey");

    res.status(200).json({
      count: words.length,
      wordKeys: words.map((w) => w.wordKey),
    });
  } catch (error) {
    console.error("[AI] Error in getTodayStudyStats:", error.message);
    res.status(500).json({ message: "Internal Server Error" });
  }
}
