import { axiosInstance } from "./axios";

export const signup = async (signupData) => {
  const response = await axiosInstance.post("/auth/signup", signupData);
  return response.data;
};

export const login = async (loginData) => {
  const response = await axiosInstance.post("/auth/login", loginData);
  return response.data;
};
export const logout = async () => {
  const response = await axiosInstance.post("/auth/logout");
  return response.data;
};

export const getAuthUser = async () => {
  try {
    const res = await axiosInstance.get("/auth/me");
    return res.data;
  } catch {
    return null;
  }
};

export const completeOnboarding = async (userData) => {
  const response = await axiosInstance.post("/auth/onboarding", userData);
  return response.data;
};

export async function getUserFriends() {
  const response = await axiosInstance.get("/users/friends");
  return response.data;
}

export async function getRecommendedUsers({ page = 1, limit = 12 } = {}) {
  const response = await axiosInstance.get("/users", { params: { page, limit } });
  // Backend returns { users, pagination }; the discover page only needs the list.
  return response.data.users;
}

export async function getOutgoingFriendReqs() {
  const response = await axiosInstance.get("/users/outgoing-friend-requests");
  return response.data;
}

export async function sendFriendRequest(userId) {
  const response = await axiosInstance.post(`/users/friend-request/${userId}`);
  return response.data;
}

export async function getFriendRequests() {
  const response = await axiosInstance.get("/users/friend-requests");
  return response.data;
}

export async function acceptFriendRequest(requestId) {
  const response = await axiosInstance.put(`/users/friend-request/${requestId}/accept`);
  return response.data;
}

export async function getStreamToken() {
  const response = await axiosInstance.get("/chat/token");
  return response.data;
}

export async function getFlashcards() {
  const response = await axiosInstance.get("/ai/flashcards");
  return response.data;
}

export async function declineFriendRequest(requestId) {
  const response = await axiosInstance.delete(`/users/friend-request/${requestId}`);
  return response.data;
}

export async function removeFriend(friendId) {
  const response = await axiosInstance.delete(`/users/friends/${friendId}`);
  return response.data;
}
export async function getNextFlashcards() {
  const response = await axiosInstance.post("/ai/flashcards/next");
  return response.data;
}

export async function recordStudyEvent(payload) {
  const response = await axiosInstance.post("/ai/study", payload);
  return response.data;
}

export async function getTodayStudy() {
  const response = await axiosInstance.get("/ai/study/today");
  return response.data;
}

export async function getLlmStats() {
  const response = await axiosInstance.get("/admin/llm-stats");
  return response.data;
}

export async function getReviewCards() {
  const response = await axiosInstance.get("/ai/review");
  return response.data;
}

export async function submitReviewResult({ targetWord, correct }) {
  const response = await axiosInstance.post("/ai/review", { targetWord, correct });
  return response.data;
}