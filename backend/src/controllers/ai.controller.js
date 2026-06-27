import User from "../models/User.js";

const DAILY_LIMIT = 5;

export async function getFlashcards(req, res) {
  try {
    const today = new Date().toISOString().split("T")[0];
    const usage = req.user.flashcardUsage || { count: 0, lastDate: "" };
    const isToday = usage.lastDate === today;
    const currentCount = isToday ? usage.count : 0;

    console.log(`[AI] User ${req.user._id} | date: ${today} | usage: ${currentCount}/${DAILY_LIMIT}`);

    if (currentCount >= DAILY_LIMIT) {
      console.log("[AI] Daily limit reached, rejecting request");
      return res.status(429).json({
        message: "Daily limit reached. Come back tomorrow!",
        remaining: 0,
      });
    }

    const { learningLanguage, nativeLanguage } = req.user;

    const categories = ["food", "travel", "family", "university", "shopping", "work", "numbers", "greetings", "emotions", "home"];
    const todayCategory = categories[Math.floor(Math.random() * categories.length)];
    console.log(`[AI] Generating cards: ${nativeLanguage} → ${learningLanguage} | theme: ${todayCategory}`);

    const prompt = `Generate exactly 5 beginner (A1) vocabulary flashcards about the theme "${todayCategory}" for a ${nativeLanguage} speaker learning ${learningLanguage}.

Rules:
- All 5 cards must be about "${todayCategory}"
- High-frequency, everyday vocabulary only
- Natural, conversational example sentences
- Only one primary meaning per word
- ACTIVE RECALL format: nativeWord is what the user already knows, targetWord is what they are learning

Return ONLY a valid JSON array. No markdown, no explanation, no extra text.

[
  {
    "nativeWord": "the word in ${nativeLanguage}",
    "targetWord": "the word in ${learningLanguage}",
    "romanization": "phonetic romanization only if ${learningLanguage} uses a non-Latin script (Japanese→romaji, Chinese→pinyin, Korean→revised romanization, Arabic/Hindi/Russian/Greek/Thai→standard transliteration). Use empty string \"\" for Latin-script languages like French, Spanish, German, Italian, Portuguese",
    "exampleTarget": "a short natural sentence using targetWord in ${learningLanguage}",
    "exampleNative": "the ${nativeLanguage} translation of that sentence",
    "partOfSpeech": "noun | verb | adjective | adverb | phrase",
    "difficulty": "A1",
    "category": "${todayCategory}"
  }
]

Return exactly 5 objects.`;

    console.log("[AI] Sending request to OpenRouter...");

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "openai/gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
      }),
    });

    console.log("[AI] OpenRouter status:", response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[AI] OpenRouter error:", errorText);
      return res.status(500).json({ message: "AI service error", detail: errorText });
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content;
    console.log("[AI] Raw text received, length:", text?.length);

    // Strip markdown fences then extract only the [...] block
    const stripped = text.replace(/```json\n?|```/g, "").trim();
    const jsonMatch = stripped.match(/\[[\s\S]*\]/);
    if (!jsonMatch) throw new Error("No JSON array found in model response");

    const sanitized = jsonMatch[0]
      // Remove raw control chars that break JSON (keep \t \n \r)
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
      // Fix bad unicode escapes (e.g. \u followed by non-hex)
      .replace(/\\u(?![0-9a-fA-F]{4})/g, "u");

    let flashcards;
    try {
      flashcards = JSON.parse(sanitized);
    } catch {
      // Last resort: escape raw newlines inside string values
      const safe = sanitized.replace(/"((?:[^"\\]|\\.)*)"/g, (_, inner) =>
        '"' + inner.replace(/\n/g, "\\n").replace(/\r/g, "\\r") + '"'
      );
      flashcards = JSON.parse(safe);
    }

    const newCount = currentCount + 1;
    await User.findByIdAndUpdate(req.user._id, {
      flashcardUsage: { count: newCount, lastDate: today },
    });

    console.log(`[AI] Success | usage now: ${newCount}/${DAILY_LIMIT} | remaining: ${DAILY_LIMIT - newCount}`);

    res.status(200).json({ flashcards, remaining: DAILY_LIMIT - newCount });
  } catch (error) {
    console.error("[AI] Error in getFlashcards:", error.message);
    res.status(500).json({ message: "Internal Server Error" });
  }
}
