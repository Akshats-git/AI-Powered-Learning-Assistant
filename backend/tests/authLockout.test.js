import { describe, it, expect } from "vitest";
import request from "supertest";
import app from "../app.js";

describe("account lockout", () => {
  it("locks the account after 5 consecutive wrong passwords", async () => {
    const email = "lockout@example.com";
    await request(app).post("/api/auth/register").send({ username: "Eve", email, password: "correct-password" });

    let res;
    for (let i = 0; i < 5; i += 1) {
      res = await request(app).post("/api/auth/login").send({ email, password: "wrong-password" });
      expect(res.status).toBe(401);
    }

    // Even the correct password is now rejected while locked.
    res = await request(app).post("/api/auth/login").send({ email, password: "correct-password" });
    expect(res.status).toBe(401);
    expect(res.body.error.message).toBe("Invalid email or password");
  });

  it("returns the identical response whether the account is locked, the password is wrong, or the user doesn't exist", async () => {
    const email = "lockout-oracle@example.com";
    await request(app).post("/api/auth/register").send({ username: "Frank", email, password: "correct-password" });
    for (let i = 0; i < 5; i += 1) {
      await request(app).post("/api/auth/login").send({ email, password: "wrong-password" });
    }

    const lockedRes = await request(app).post("/api/auth/login").send({ email, password: "correct-password" });
    const noSuchUserRes = await request(app)
      .post("/api/auth/login")
      .send({ email: "nobody@example.com", password: "whatever" });

    expect(lockedRes.status).toBe(noSuchUserRes.status);
    expect(lockedRes.body.error.message).toBe(noSuchUserRes.body.error.message);
  });

  it("never exposes lockout fields on the user object", async () => {
    const email = "no-leak@example.com";
    const res = await request(app)
      .post("/api/auth/register")
      .send({ username: "Grace", email, password: "correct-password" });

    expect(res.body.user.failedLoginAttempts).toBeUndefined();
    expect(res.body.user.lockUntil).toBeUndefined();
  });
});
