import { GoogleGenerativeAI } from "@google/generative-ai";

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

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
    const result = await model.generateContent(prompt);
    const text = result.response.text();

    const clean = text.replace(/```json|```/g, "").trim();
    const flashcards = JSON.parse(clean);

    res.status(200).json({ flashcards });
  } catch (error) {
    console.error("Error in getFlashcards controller:", error.message);
    res.status(500).json({ message: "Internal Server Error" });
  }
}
