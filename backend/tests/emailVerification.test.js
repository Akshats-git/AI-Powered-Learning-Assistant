import { describe, it, expect, vi } from "vitest";
import request from "supertest";
import app from "../app.js";
import User from "../models/User.js";
import EmailVerificationToken from "../models/EmailVerificationToken.js";
import { createVerificationToken, consumeVerificationToken } from "../utils/emailVerificationStore.js";

describe("email verification", () => {
  it("registers a user as unverified", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ username: "Quinn", email: "quinn@example.com", password: "correct-password" });

    expect(res.body.user.emailVerifiedAt).toBeFalsy();
  });

  it("still registers the user if issuing the verification token fails", async () => {
    const spy = vi.spyOn(EmailVerificationToken, "create").mockRejectedValueOnce(new Error("db hiccup"));
    const res = await request(app)
      .post("/api/auth/register")
      .send({ username: "Vic", email: "vic@example.com", password: "correct-password" });
    spy.mockRestore();

    expect(res.status).toBe(201);
    expect(await User.findOne({ email: "vic@example.com" })).toBeTruthy();
  });

  it("verifies the email with a valid token", async () => {
    const email = "verify-flow@example.com";
    await request(app).post("/api/auth/register").send({ username: "Ray", email, password: "correct-password" });
    const user = await User.findOne({ email });

    const token = await createVerificationToken(user._id);
    const res = await request(app).post("/api/auth/verify-email").send({ token });
    expect(res.status).toBe(200);

    const updated = await User.findById(user._id);
    expect(updated.emailVerifiedAt).toBeTruthy();
  });

  it("rejects an already-used verification token", async () => {
    const email = "verify-reuse@example.com";
    await request(app).post("/api/auth/register").send({ username: "Sam", email, password: "correct-password" });
    const user = await User.findOne({ email });

    const token = await createVerificationToken(user._id);
    const first = await request(app).post("/api/auth/verify-email").send({ token });
    expect(first.status).toBe(200);

    const second = await request(app).post("/api/auth/verify-email").send({ token });
    expect(second.status).toBe(400);
  });

  it("lets only one of several concurrent requests redeem a token", async () => {
    const email = "verify-race@example.com";
    await request(app).post("/api/auth/register").send({ username: "Tess", email, password: "correct-password" });
    const user = await User.findOne({ email });

    const token = await createVerificationToken(user._id);
    const results = await Promise.all(Array.from({ length: 5 }, () => consumeVerificationToken(token)));

    expect(results.filter(Boolean)).toHaveLength(1);
  });

  it("rejects a garbage token", async () => {
    const res = await request(app).post("/api/auth/verify-email").send({ token: "not-a-real-token" });
    expect(res.status).toBe(400);
  });
});

describe("resend verification", () => {
  it("requires authentication", async () => {
    const res = await request(app).post("/api/auth/resend-verification");
    expect(res.status).toBe(401);
  });

  it("sends another verification email for an unverified, logged-in user", async () => {
    const registerRes = await request(app)
      .post("/api/auth/register")
      .send({ username: "Tara", email: "tara@example.com", password: "correct-password" });

    const res = await request(app)
      .post("/api/auth/resend-verification")
      .set("Authorization", `Bearer ${registerRes.body.token}`);
    expect(res.status).toBe(200);
  });

  it("refuses to resend once already verified", async () => {
    const email = "verify-already@example.com";
    const registerRes = await request(app)
      .post("/api/auth/register")
      .send({ username: "Uma", email, password: "correct-password" });
    const user = await User.findOne({ email });

    const token = await createVerificationToken(user._id);
    await request(app).post("/api/auth/verify-email").send({ token });

    const res = await request(app)
      .post("/api/auth/resend-verification")
      .set("Authorization", `Bearer ${registerRes.body.token}`);
    expect(res.status).toBe(400);
  });
});
