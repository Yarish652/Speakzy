import express from "express";
import { getFlashcards, getNextFlashcards } from "../controllers/ai.controller.js";
import { protectRoute } from "../middleware/auth.middleware.js";

const router = express.Router();

router.get("/flashcards", protectRoute, getFlashcards);
router.post("/flashcards/next", protectRoute, getNextFlashcards);

export default router;