import express from "express";
import { login, logout, onboard, signup } from "../controllers/auth.controller.js";
import { protectRoute } from "../middleware/auth.middleware.js";
import { isAdminEmail } from "../middleware/admin.middleware.js";
import { loginLimiter, signupLimiter, authLimiter } from "../middleware/rateLimit.middleware.js";
import { validateBody, signupSchema, loginSchema, onboardSchema } from "../lib/validation.js";


const router = express.Router();

router.post("/signup", signupLimiter, validateBody(signupSchema), signup);
router.post("/login", loginLimiter, validateBody(loginSchema), login);
router.post("/logout", authLimiter, logout);

router.post("/onboarding", authLimiter, protectRoute, validateBody(onboardSchema), onboard);


// check if user is logged in. isAdmin lets the UI decide whether to show
// admin entry points — the /api/admin routes stay gated server-side.
router.get("/me", protectRoute, (req, res) => {
  res.status(200).json({ success: true, user: req.user, isAdmin: isAdminEmail(req.user.email) });
});

export default router;
