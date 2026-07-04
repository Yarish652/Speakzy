import express from "express";
import { login, logout, onboard, signup } from "../controllers/auth.controller.js";
import { protectRoute } from "../middleware/auth.middleware.js";
import { loginLimiter, signupLimiter, authLimiter } from "../middleware/rateLimit.middleware.js";

const router = express.Router();
console.log("[auth.route] Auth routes initialized");

router.post("/signup", signupLimiter, signup);
router.post("/login", loginLimiter, login);
router.post("/logout", authLimiter, logout);

router.post("/onboarding", authLimiter, protectRoute, onboard);


// check if user is logged in
router.get("/me", protectRoute, (req, res) => {
  res.status(200).json({ success: true, user: req.user });
});

export default router;
