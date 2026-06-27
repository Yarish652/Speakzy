export async function getFlashcards(req, res) {
  try {
    const { learningLanguage, nativeLanguage } = req.user;
    console.log("[AI] getFlashcards called for user:", req.user._id);
    console.log("[AI] learningLanguage:", learningLanguage, "| nativeLanguage:", nativeLanguage);

    const prompt = `Generate 5 vocabulary flashcards for someone who speaks ${nativeLanguage} and is learning ${learningLanguage}.

    Return ONLY a JSON array, no markdown, no explanation, exactly like this:
    [
      {
        "word": "word in ${learningLanguage}",
        "translation": "translation in ${nativeLanguage}",
        "exampleSentence": "simple example sentence in ${learningLanguage}",
        "exampleTranslation": "translation of example sentence in ${nativeLanguage}"
      }
    ]`;

    console.log("[AI] Sending request to OpenRouter...");

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.0-flash-exp:free",
        messages: [{ role: "user", content: prompt }],
      }),
    });

    console.log("[AI] OpenRouter status:", response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[AI] OpenRouter error response:", errorText);
      return res.status(500).json({ message: "OpenRouter API error", detail: errorText });
    }

    const data = await response.json();
    console.log("[AI] OpenRouter raw response:", JSON.stringify(data, null, 2));

    const text = data.choices?.[0]?.message?.content;
    console.log("[AI] Extracted text:", text);

    const clean = text.replace(/```json|```/g, "").trim();
    const flashcards = JSON.parse(clean);
    console.log("[AI] Parsed flashcards:", flashcards);

    res.status(200).json({ flashcards });
  } catch (error) {
    console.error("[AI] Error in getFlashcards controller:", error.message);
    res.status(500).json({ message: "Internal Server Error" });
  }
}
