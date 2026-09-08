import { describe, it, expect } from "vitest";
import request from "supertest";
import app from "../app.js";
import { createUserWithToken } from "./helpers.js";

// Boundary validation (Zod) rejects malformed input with a 400 before it
// reaches a controller or the database, instead of a controller-specific
// `if (!field)` check or, worse, an uncaught Mongoose CastError on a bad id.
describe("request validation", () => {
  it("rejects registration with a missing field with a VALIDATION_ERROR", async () => {
    const res = await request(app).post("/api/auth/register").send({ email: "no-username@example.com" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(res.body.error.details).toEqual(expect.arrayContaining([expect.objectContaining({ path: "username" })]));
  });

  it("rejects registration with an invalid email", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ username: "A", email: "not-an-email", password: "password123" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects registration with a too-short password", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ username: "A", email: "short@example.com", password: "123" });
    expect(res.status).toBe(400);
  });

  it("rejects a malformed document id with a 400 instead of a 500 CastError", async () => {
    const { token } = await createUserWithToken();
    const res = await request(app)
      .get("/api/documents/not-a-valid-object-id")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects generate-flashcards with a malformed documentId", async () => {
    const { token } = await createUserWithToken();
    const res = await request(app)
      .post("/api/ai/generate-flashcards")
      .set("Authorization", `Bearer ${token}`)
      .send({ documentId: "abc" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects chat with an empty message", async () => {
    const { token } = await createUserWithToken();
    const res = await request(app)
      .post("/api/ai/chat")
      .set("Authorization", `Bearer ${token}`)
      .send({ documentId: "0".repeat(24), message: "" });
    expect(res.status).toBe(400);
  });
});
