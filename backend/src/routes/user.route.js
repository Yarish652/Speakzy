import express from "express";
import { protectRoute } from "../middleware/auth.middleware.js";
import { validateObjectIdParam } from "../lib/validation.js";
import {
  acceptFriendRequest,
  declineFriendRequest,
  getFriendRequests,
  getMyFriends,
  getOutgoingFriendReqs,
  getRecommendedUsers,
  removeFriend,
  sendFriendRequest,
} from "../controllers/user.controller.js";

const router = express.Router();

// apply auth middleware to all routes
router.use(protectRoute);

router.get("/", getRecommendedUsers);
router.get("/friends", getMyFriends);

router.post("/friend-request/:id", validateObjectIdParam("id"), sendFriendRequest);
router.put("/friend-request/:id/accept", validateObjectIdParam("id"), acceptFriendRequest);
router.delete("/friend-request/:id", validateObjectIdParam("id"), declineFriendRequest);

router.get("/friend-requests", getFriendRequests);
router.get("/outgoing-friend-requests", getOutgoingFriendReqs);

router.delete("/friends/:id", validateObjectIdParam("id"), removeFriend);

export default router;