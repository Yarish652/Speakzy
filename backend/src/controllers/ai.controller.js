export async function getFlashcards(req, res) {
  try {
    const { learningLanguage, nativeLanguage } = req.user;

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

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
        }),
      }
    );

    const data = await response.json();
    const text = data.candidates[0].content.parts[0].text;

    // strip markdown code fences if Gemini adds them
    const clean = text.replace(/```json|```/g, "").trim();
    const flashcards = JSON.parse(clean);

    res.status(200).json({ flashcards });
  } catch (error) {
    console.error("Error in getFlashcards controller:", error.message);
    res.status(500).json({ message: "Internal Server Error" });
  }
}