import express from "express";
import { getFlashcards } from "../controllers/ai.controller.js";
import { protectRoute } from "../middleware/auth.middleware.js";

const router = express.Router();

router.get("/flashcards", protectRoute, getFlashcards);

export default router;