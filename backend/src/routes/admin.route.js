import express from "express";
import { protectRoute } from "../middleware/auth.middleware.js";
import { requireAdmin } from "../middleware/admin.middleware.js";
import { getLlmStats } from "../controllers/admin.controller.js";

const router = express.Router();

router.get("/llm-stats", protectRoute, requireAdmin, getLlmStats);

export default router;
