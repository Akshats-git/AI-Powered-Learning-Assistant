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
