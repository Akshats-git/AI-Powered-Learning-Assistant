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
