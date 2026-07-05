import User from "../models/User.js";

const DAILY_LIMIT = 5;
const CATEGORIES = [
  "food", "travel", "family", "university", "shopping",
  "work", "numbers", "greetings", "emotions", "home",
];

const PRIMARY_MODEL = "openai/gpt-4o-mini";
const FALLBACK_MODEL = "google/gemini-flash-1.5";

function buildPrompt(category, nativeLanguage, learningLanguage) {
  return `Generate exactly 5 beginner (A1) vocabulary flashcards about the theme "${category}" for a ${nativeLanguage} speaker learning ${learningLanguage}.

Rules:
- All 5 cards must be about "${category}"
- High-frequency, everyday vocabulary only
- Natural, conversational example sentences
- Only one primary meaning per word
- ACTIVE RECALL format: nativeWord is what the user already knows, targetWord is what they are learning

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

async function callModel(model, prompt) {
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      plugins: [{ id: "response-healing" }],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenRouter error from ${model}: ${response.status} ${errorText}`);
  }

  const data = await response.json();
  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new Error(`Empty response body from ${model}`);

  const parsed = JSON.parse(text);
  if (!Array.isArray(parsed.flashcards) || parsed.flashcards.length === 0) {
    throw new Error(`Model ${model} returned no flashcards array`);
  }
  return parsed.flashcards;
}

async function generateFlashcards(category, nativeLanguage, learningLanguage) {
  const prompt = buildPrompt(category, nativeLanguage, learningLanguage);
  try {
    return await callModel(PRIMARY_MODEL, prompt);
  } catch (primaryError) {
    console.error("[AI] Primary model failed, trying fallback:", primaryError.message);
    try {
      return await callModel(FALLBACK_MODEL, prompt);
    } catch (fallbackError) {
      console.error("[AI] Fallback model also failed:", fallbackError.message);
      throw new Error("AI generation failed on both primary and fallback models");
    }
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

  const flashcards = await generateFlashcards(category, nativeLanguage, learningLanguage);

  const newCount = currentCount + 1;
  await User.findByIdAndUpdate(user._id, {
    flashcardUsage: { count: newCount, lastDate: today, cards: flashcards, category },
  });

  return { flashcards, remaining: DAILY_LIMIT - newCount };
}

export async function getFlashcards(req, res) {
  try {
    const today = new Date().toISOString().split("T")[0];
    const usage = req.user.flashcardUsage || { count: 0, lastDate: "", cards: [] };
    const isToday = usage.lastDate === today;

    if (isToday && Array.isArray(usage.cards) && usage.cards.length > 0) {
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
