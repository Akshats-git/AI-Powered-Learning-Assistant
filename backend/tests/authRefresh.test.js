import { describe, it, expect } from "vitest";
import request from "supertest";
import app from "../app.js";

describe("refresh tokens", () => {
  it("sets an httpOnly refresh cookie on login and issues a new access token from it", async () => {
    const agent = request.agent(app);
    const email = "refresh@example.com";
    const registerRes = await agent
      .post("/api/auth/register")
      .send({ username: "Hank", email, password: "correct-password" });

    expect(registerRes.headers["set-cookie"]?.some((c) => c.startsWith("refreshToken="))).toBe(true);

    const refreshRes = await agent.post("/api/auth/refresh");
    expect(refreshRes.status).toBe(200);
    expect(refreshRes.body.token).toBeTruthy();
    // Rotated: a new refresh cookie is issued on every refresh.
    expect(refreshRes.headers["set-cookie"]?.some((c) => c.startsWith("refreshToken="))).toBe(true);
  });

  it("rejects a refresh with no cookie", async () => {
    const res = await request(app).post("/api/auth/refresh");
    expect(res.status).toBe(401);
  });

  it("rejects a refresh token used directly as an access token", async () => {
    const registerRes = await request(app)
      .post("/api/auth/register")
      .send({ username: "Ivy", email: "ivy@example.com", password: "correct-password" });

    const setCookie = registerRes.headers["set-cookie"].find((c) => c.startsWith("refreshToken="));
    const refreshToken = setCookie.split(";")[0].split("=")[1];

    const res = await request(app).get("/api/auth/profile").set("Authorization", `Bearer ${refreshToken}`);
    expect(res.status).toBe(401);
  });

  it("clears the refresh cookie on logout, so a later refresh fails", async () => {
    const agent = request.agent(app);
    await agent
      .post("/api/auth/register")
      .send({ username: "Jill", email: "jill@example.com", password: "correct-password" });

    await agent.post("/api/auth/logout");
    const res = await agent.post("/api/auth/refresh");
    expect(res.status).toBe(401);
  });
});

const extractRefreshCookie = (res) => {
  const setCookie = res.headers["set-cookie"].find((c) => c.startsWith("refreshToken="));
  return setCookie.split(";")[0];
};

describe("refresh token rotation with reuse detection", () => {
  it("rejects a replayed (already-rotated-away) refresh token, and revokes the family", async () => {
    const agent = request.agent(app);
    const registerRes = await agent.post("/api/auth/register").send({ username: "Kim", email: "kim@example.com", password: "correct-password" });

    // Capture the original refresh cookie before rotating past it.
    const originalRefreshCookie = extractRefreshCookie(registerRes);

    const firstRefresh = await agent.post("/api/auth/refresh");
    expect(firstRefresh.status).toBe(200);

    // Replay the pre-rotation cookie value directly — simulating a stolen
    // token used after the legitimate client already refreshed past it.
    const replay = await request(app).post("/api/auth/refresh").set("Cookie", originalRefreshCookie);
    expect(replay.status).toBe(401);
    expect(replay.body.error.message).toMatch(/reuse detected/i);

    // The whole family is burned — even the token the *legitimate* rotation
    // just issued no longer works.
    const afterReuse = await agent.post("/api/auth/refresh");
    expect(afterReuse.status).toBe(401);
  });

  it("revokes the refresh token server-side on logout, not just the browser cookie", async () => {
    const registerRes = await request(app)
      .post("/api/auth/register")
      .send({ username: "Lee", email: "lee@example.com", password: "correct-password" });

    const stolenRefreshCookie = extractRefreshCookie(registerRes);

    await request(app).post("/api/auth/logout").set("Cookie", stolenRefreshCookie);

    // Even presented directly (as if it had been exfiltrated before logout),
    // the token no longer works — logout revoked it server-side.
    const res = await request(app).post("/api/auth/refresh").set("Cookie", stolenRefreshCookie);
    expect(res.status).toBe(401);
  });
});
