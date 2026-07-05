import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import app from "../app.js";

let ipCounter = 1000;
function freshIp() {
  ipCounter += 1;
  return `10.0.1.${ipCounter % 250}`;
}

async function createOnboardedUser(email) {
  const agent = request.agent(app);
  await agent
    .post("/api/auth/signup")
    .set("X-Forwarded-For", freshIp())
    .send({ fullName: email.split("@")[0], email, password: "correcthorse" });

  await agent
    .post("/api/auth/onboarding")
    .set("X-Forwarded-For", freshIp())
    .send({
      fullName: email.split("@")[0],
      bio: "test bio",
      nativeLanguage: "english",
      learningLanguage: "french",
      location: "Test City",
    });

  const me = await agent.get("/api/auth/me").set("X-Forwarded-For", freshIp());
  return { agent, userId: me.body.user._id };
}

describe("friend request flow", () => {
  let userA, userB, userC;

  beforeEach(async () => {
    userA = await createOnboardedUser("a@example.com");
    userB = await createOnboardedUser("b@example.com");
    userC = await createOnboardedUser("c@example.com");
  });

  it("sends, then blocks a duplicate request", async () => {
    const res1 = await userA.agent
      .post(`/api/users/friend-request/${userB.userId}`)
      .set("X-Forwarded-For", freshIp());
    expect(res1.status).toBe(201);

    const res2 = await userA.agent
      .post(`/api/users/friend-request/${userB.userId}`)
      .set("X-Forwarded-For", freshIp());
    expect(res2.status).toBe(400);
  });

  it("rejects a malformed id instead of crashing", async () => {
    const res = await userA.agent
      .post("/api/users/friend-request/not-a-valid-id")
      .set("X-Forwarded-For", freshIp());
    expect(res.status).toBe(400);
  });

  it("lets the recipient decline, and allows re-sending afterward", async () => {
    const sendRes = await userA.agent
      .post(`/api/users/friend-request/${userB.userId}`)
      .set("X-Forwarded-For", freshIp());
    const requestId = sendRes.body._id;

    const declineRes = await userB.agent
      .delete(`/api/users/friend-request/${requestId}`)
      .set("X-Forwarded-For", freshIp());
    expect(declineRes.status).toBe(200);

    const resendRes = await userA.agent
      .post(`/api/users/friend-request/${userB.userId}`)
      .set("X-Forwarded-For", freshIp());
    expect(resendRes.status).toBe(201);
  });

  it("prevents a third party from accepting someone else's request", async () => {
    const sendRes = await userA.agent
      .post(`/api/users/friend-request/${userB.userId}`)
      .set("X-Forwarded-For", freshIp());
    const requestId = sendRes.body._id;

    const res = await userC.agent
      .put(`/api/users/friend-request/${requestId}/accept`)
      .set("X-Forwarded-For", freshIp());
    expect(res.status).toBe(403);
  });

  it("accepts a request and adds both users to each other's friends", async () => {
    const sendRes = await userA.agent
      .post(`/api/users/friend-request/${userB.userId}`)
      .set("X-Forwarded-For", freshIp());
    const requestId = sendRes.body._id;

    const acceptRes = await userB.agent
      .put(`/api/users/friend-request/${requestId}/accept`)
      .set("X-Forwarded-For", freshIp());
    expect(acceptRes.status).toBe(200);

    const aFriends = await userA.agent.get("/api/users/friends").set("X-Forwarded-For", freshIp());
    const bFriends = await userB.agent.get("/api/users/friends").set("X-Forwarded-For", freshIp());

    expect(aFriends.body.some((f) => f._id === userB.userId)).toBe(true);
    expect(bFriends.body.some((f) => f._id === userA.userId)).toBe(true);
  });

  it("removes a friend from both sides and allows re-sending a request", async () => {
    const sendRes = await userA.agent
      .post(`/api/users/friend-request/${userB.userId}`)
      .set("X-Forwarded-For", freshIp());
    await userB.agent
      .put(`/api/users/friend-request/${sendRes.body._id}/accept`)
      .set("X-Forwarded-For", freshIp());

    const removeRes = await userA.agent
      .delete(`/api/users/friends/${userB.userId}`)
      .set("X-Forwarded-For", freshIp());
    expect(removeRes.status).toBe(200);

    const aFriends = await userA.agent.get("/api/users/friends").set("X-Forwarded-For", freshIp());
    expect(aFriends.body.some((f) => f._id === userB.userId)).toBe(false);

    const resendRes = await userA.agent
      .post(`/api/users/friend-request/${userB.userId}`)
      .set("X-Forwarded-For", freshIp());
    expect(resendRes.status).toBe(201);
  });
});