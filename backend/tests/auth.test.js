import { describe, it, expect } from "vitest";
import request from "supertest";
import app from "../app.js";

describe("auth", () => {
  it("registers a new user and returns a token without the password hash", async () => {
    const res = await request(app).post("/api/auth/register").send({
      username: "Alice",
      email: "alice@example.com",
      password: "password123",
    });

    expect(res.status).toBe(201);
    expect(res.body.token).toBeTruthy();
    expect(res.body.user.email).toBe("alice@example.com");
    expect(res.body.user.password).toBeUndefined();
  });

  it("rejects registering the same email twice", async () => {
    await request(app)
      .post("/api/auth/register")
      .send({ username: "A", email: "dup@example.com", password: "password123" });

    const res = await request(app)
      .post("/api/auth/register")
      .send({ username: "B", email: "dup@example.com", password: "password123" });

    expect(res.status).toBe(400);
  });

  it("logs in with correct credentials", async () => {
    await request(app)
      .post("/api/auth/register")
      .send({ username: "Carl", email: "carl@example.com", password: "password123" });

    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "carl@example.com", password: "password123" });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
  });

  it("rejects login with the wrong password", async () => {
    await request(app)
      .post("/api/auth/register")
      .send({ username: "Dana", email: "dana@example.com", password: "password123" });

    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "dana@example.com", password: "wrong-password" });

    expect(res.status).toBe(401);
  });

  it("rejects /profile without a token", async () => {
    const res = await request(app).get("/api/auth/profile");
    expect(res.status).toBe(401);
  });

  it("rejects /profile with a garbage token", async () => {
    const res = await request(app).get("/api/auth/profile").set("Authorization", "Bearer not-a-real-token");
    expect(res.status).toBe(401);
  });
});

describe("password hash migration (bcrypt → argon2id)", () => {
  it("logs in successfully against a legacy bcrypt hash, then transparently upgrades it to argon2id", async () => {
    const bcrypt = (await import("bcryptjs")).default;
    const { default: User } = await import("../models/User.js");

    const bcryptHash = await bcrypt.hash("legacy-password-123", 10);
    // Bypass the model's pre-save hashing hook to plant a hash exactly the
    // way an account created before this migration shipped would have one.
    await User.collection.insertOne({
      username: "Legacy User",
      email: "legacy@example.com",
      password: bcryptHash,
      failedLoginAttempts: 0,
      lockUntil: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const loginRes = await request(app).post("/api/auth/login").send({ email: "legacy@example.com", password: "legacy-password-123" });
    expect(loginRes.status).toBe(200);

    const stored = await User.findOne({ email: "legacy@example.com" });
    expect(stored.password).toMatch(/^\$argon2id\$/);

    // And the upgraded hash still logs in correctly afterward.
    const secondLogin = await request(app).post("/api/auth/login").send({ email: "legacy@example.com", password: "legacy-password-123" });
    expect(secondLogin.status).toBe(200);
  });
});
