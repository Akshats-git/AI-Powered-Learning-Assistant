import { describe, it, expect } from "vitest";
import request from "supertest";
import app from "../app.js";
import User from "../models/User.js";
import { createResetToken } from "../utils/passwordResetStore.js";

const extractCookie = (res, name) => res.headers["set-cookie"]?.find((c) => c.startsWith(`${name}=`))?.split(";")[0];

describe("forgot password", () => {
  it("returns the identical response for a registered and an unregistered email", async () => {
    const email = "reset-exists@example.com";
    await request(app).post("/api/auth/register").send({ username: "Mia", email, password: "correct-password" });

    const existsRes = await request(app).post("/api/auth/forgot-password").send({ email });
    const missingRes = await request(app).post("/api/auth/forgot-password").send({ email: "nobody@example.com" });

    expect(existsRes.status).toBe(200);
    expect(existsRes.body).toEqual(missingRes.body);
  });
});

describe("reset password", () => {
  it("resets the password with a valid token and allows login with the new password", async () => {
    const email = "reset-flow@example.com";
    await request(app).post("/api/auth/register").send({ username: "Nora", email, password: "old-password" });
    const user = await User.findOne({ email });

    const token = await createResetToken(user._id);
    const resetRes = await request(app).post("/api/auth/reset-password").send({ token, newPassword: "new-password" });
    expect(resetRes.status).toBe(200);

    const oldLogin = await request(app).post("/api/auth/login").send({ email, password: "old-password" });
    expect(oldLogin.status).toBe(401);

    const newLogin = await request(app).post("/api/auth/login").send({ email, password: "new-password" });
    expect(newLogin.status).toBe(200);
  });

  it("rejects an already-used token", async () => {
    const email = "reset-reuse@example.com";
    await request(app).post("/api/auth/register").send({ username: "Omar", email, password: "old-password" });
    const user = await User.findOne({ email });

    const token = await createResetToken(user._id);
    const first = await request(app).post("/api/auth/reset-password").send({ token, newPassword: "new-password-1" });
    expect(first.status).toBe(200);

    const second = await request(app).post("/api/auth/reset-password").send({ token, newPassword: "new-password-2" });
    expect(second.status).toBe(400);
  });

  it("rejects a garbage token", async () => {
    const res = await request(app)
      .post("/api/auth/reset-password")
      .send({ token: "not-a-real-token", newPassword: "new-password" });
    expect(res.status).toBe(400);
  });

  it("revokes existing sessions on reset, so an old refresh cookie stops working", async () => {
    const email = "reset-sessions@example.com";
    const agent = request.agent(app);
    const registerRes = await agent
      .post("/api/auth/register")
      .send({ username: "Priya", email, password: "old-password" });
    const staleRefreshCookie = extractCookie(registerRes, "refreshToken");
    const staleCsrfCookie = extractCookie(registerRes, "csrfToken");

    const user = await User.findOne({ email });
    const token = await createResetToken(user._id);
    await request(app).post("/api/auth/reset-password").send({ token, newPassword: "new-password" });

    const refreshAttempt = await request(app)
      .post("/api/auth/refresh")
      .set("Cookie", `${staleRefreshCookie}; ${staleCsrfCookie}`)
      .set("X-CSRF-Token", registerRes.body.csrfToken);
    expect(refreshAttempt.status).toBe(401);
  });
});
