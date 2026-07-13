import StudiedWord from "../models/StudiedWord.js";

// Leitner spaced repetition over the StudiedWord collection. Deliberately
// LLM-free: cards are replayed from stored snapshots, so revision costs
// nothing and works even if every AI provider is down.
//
// Box intervals in days: review a word right around when you'd forget it.
// Correct -> next box (longer gap). Wrong -> back to box 1 (see it tomorrow).
const BOX_INTERVALS_DAYS = [1, 2, 4, 7, 14];
const MAX_BOX = BOX_INTERVALS_DAYS.length;
const REVIEW_BATCH_LIMIT = 10;

function nextReviewDate(box) {
  const days = BOX_INTERVALS_DAYS[box - 1];
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

// GET /api/ai/review — due cards for the user's current learning language,
// weakest words first (lowest box, then longest overdue).
export async function getReviewCards(req, res) {
  try {
    const targetLanguage = (req.user.learningLanguage || "").toLowerCase().trim();
    if (!targetLanguage) {
      return res.status(400).json({ message: "Complete onboarding before reviewing" });
    }

    const dueFilter = {
      userId: req.user._id,
      targetLanguage,
      // Docs from before the review feature have no nextReviewAt in the DB
      // (schema defaults only apply to new docs) — treat those as due now.
      $or: [{ nextReviewAt: { $lte: new Date() } }, { nextReviewAt: { $exists: false } }],
    };

    const [cards, dueCount] = await Promise.all([
      StudiedWord.find(dueFilter)
        .sort({ box: 1, nextReviewAt: 1 })
        .limit(REVIEW_BATCH_LIMIT)
        .select("targetWord nativeWord category exampleTarget exampleNative romanization partOfSpeech box"),
      StudiedWord.countDocuments(dueFilter),
    ]);

    res.status(200).json({ cards, dueCount });
  } catch (error) {
    console.error("[Review] Error in getReviewCards:", error.message);
    res.status(500).json({ message: "Internal Server Error" });
  }
}

// POST /api/ai/review — apply one review result.
export async function submitReviewResult(req, res) {
  try {
    // req.body validated by validateBody(reviewResultSchema)
    const { targetWord, correct } = req.body;

    const targetLanguage = (req.user.learningLanguage || "").toLowerCase().trim();
    if (!targetLanguage) {
      return res.status(400).json({ message: "Complete onboarding before reviewing" });
    }

    const word = await StudiedWord.findOne({
      userId: req.user._id,
      targetLanguage,
      wordKey: targetWord.toLowerCase(),
    });

    if (!word) {
      return res.status(404).json({ message: "Word not found in your study history" });
    }

    word.box = correct ? Math.min(word.box + 1, MAX_BOX) : 1;
    word.nextReviewAt = nextReviewDate(word.box);
    // A review is a study interaction: it counts toward today's stats, and
    // correct answers strengthen the knewIt signal.
    word.timesStudied += 1;
    if (correct) word.knewIt += 1;
    await word.save();

    res.status(200).json({
      success: true,
      word: {
        targetWord: word.targetWord,
        box: word.box,
        nextReviewAt: word.nextReviewAt,
      },
    });
  } catch (error) {
    console.error("[Review] Error in submitReviewResult:", error.message);
    res.status(500).json({ message: "Internal Server Error" });
  }
}
