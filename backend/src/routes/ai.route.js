import express from "express";
import {
  getFlashcards,
  getNextFlashcards,
  recordStudyEvent,
  getTodayStudyStats,
} from "../controllers/ai.controller.js";
import { getReviewCards, submitReviewResult } from "../controllers/review.controller.js";
import { explainSentence } from "../controllers/grammar.controller.js";
import { protectRoute } from "../middleware/auth.middleware.js";
import { validateBody } from "../lib/validation.js";
import { studyEventSchema, reviewResultSchema, explainRequestSchema } from "../lib/aiSchemas.js";

const router = express.Router();

router.get("/flashcards", protectRoute, getFlashcards);
router.post("/flashcards/next", protectRoute, getNextFlashcards);

router.post("/study", protectRoute, validateBody(studyEventSchema), recordStudyEvent);
router.get("/study/today", protectRoute, getTodayStudyStats);

router.get("/review", protectRoute, getReviewCards);
router.post("/review", protectRoute, validateBody(reviewResultSchema), submitReviewResult);

router.post("/explain", protectRoute, validateBody(explainRequestSchema), explainSentence);

export default router;
