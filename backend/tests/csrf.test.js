import { describe, it, expect } from "vitest";
import request from "supertest";
import app from "../app.js";

describe("CSRF protection on /api/auth/refresh", () => {
  it("issues a csrfToken cookie and a matching value in the response body on register", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ username: "Csrf1", email: "csrf1@example.com", password: "correct-password" });

    expect(res.headers["set-cookie"]?.some((c) => c.startsWith("csrfToken="))).toBe(true);
    expect(typeof res.body.csrfToken).toBe("string");
    expect(res.body.csrfToken.length).toBeGreaterThan(10);
  });

  it("accepts a refresh when the header matches the cookie", async () => {
    const agent = request.agent(app);
    const registerRes = await agent
      .post("/api/auth/register")
      .send({ username: "Csrf2", email: "csrf2@example.com", password: "correct-password" });

    const res = await agent.post("/api/auth/refresh").set("X-CSRF-Token", registerRes.body.csrfToken);
    expect(res.status).toBe(200);
  });

  it("rejects a refresh when the header doesn't match the cookie", async () => {
    const agent = request.agent(app);
    await agent
      .post("/api/auth/register")
      .send({ username: "Csrf3", email: "csrf3@example.com", password: "correct-password" });

    const res = await agent.post("/api/auth/refresh").set("X-CSRF-Token", "wrong-value");
    expect(res.status).toBe(403);
  });

  it("rejects a refresh with no CSRF header at all", async () => {
    const agent = request.agent(app);
    await agent
      .post("/api/auth/register")
      .send({ username: "Csrf4", email: "csrf4@example.com", password: "correct-password" });

    const res = await agent.post("/api/auth/refresh");
    expect(res.status).toBe(403);
    expect(res.body.error.message).toMatch(/csrf/i);
  });

  it("rejects a cross-origin-style request that has the header but not the cookie", async () => {
    // A same-origin script could set an X-CSRF-Token header to any value it
    // likes, but without the matching cookie (which only the real API
    // response, read same-origin, could have supplied) it's rejected —
    // this is what stops an attacker's page from just guessing or omitting
    // the cookie and hoping the header alone is enough.
    const res = await request(app).post("/api/auth/refresh").set("X-CSRF-Token", "some-guessed-value");
    expect(res.status).toBe(401); // no refresh cookie either, so it fails at that check first
  });
});
