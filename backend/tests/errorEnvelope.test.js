import { describe, it, expect } from "vitest";
import request from "supertest";
import app from "../app.js";

// Every error response must use the typed envelope so the frontend and any
// future API consumer can rely on a stable shape instead of guessing where
// the message lives.
describe("error envelope", () => {
  it("wraps 404s in { error: { code, message, requestId } }", async () => {
    const res = await request(app).get("/api/does-not-exist");
    expect(res.status).toBe(404);
    expect(res.body.error).toMatchObject({
      code: "NOT_FOUND",
      message: expect.stringContaining("Route not found"),
    });
    expect(res.body.error.requestId).toBeTruthy();
    expect(res.body.message).toBeUndefined();
  });

  it("wraps 401s with the UNAUTHORIZED code", async () => {
    const res = await request(app).get("/api/auth/profile");
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHORIZED");
  });
});

describe("error handler hygiene", () => {
  const call = async (err, env = "test") => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = env;
    const { errorHandler } = await import("../middlewares/errorMiddleware.js");
    let status, payload;
    const res = { statusCode: 200, status(c) { status = c; return this; }, json(b) { payload = b; } };
    errorHandler(err, { id: "r1", originalUrl: "/x" }, res, () => {});
    process.env.NODE_ENV = prev;
    return { status, error: payload.error };
  };

  it("maps a duplicate-key error to 409 instead of leaking E11000 text", async () => {
    const { status, error } = await call(Object.assign(new Error("E11000 duplicate key error collection: app.users index: email_1"), { code: 11000 }));
    expect(status).toBe(409);
    expect(error.message).not.toMatch(/E11000/);
  });

  it("maps mongoose validation and cast errors to 400", async () => {
    expect((await call(Object.assign(new Error("x"), { name: "ValidationError" }))).status).toBe(400);
    expect((await call(Object.assign(new Error("x"), { name: "CastError" }))).status).toBe(400);
  });

  it("hides internal 5xx messages in production, but keeps deliberate ones", async () => {
    const internal = await call(new Error("connect ECONNREFUSED 10.0.0.5:27017"), "production");
    expect(internal.status).toBe(500);
    expect(internal.error.message).not.toMatch(/ECONNREFUSED/);
    expect(internal.error.stack).toBeUndefined();

    const deliberate = await call(Object.assign(new Error("AI is temporarily unavailable"), { statusCode: 503, code: "CIRCUIT_OPEN" }), "production");
    expect(deliberate.error.message).toBe("AI is temporarily unavailable");
  });

  it("still shows 4xx messages in production", async () => {
    const { error } = await call(Object.assign(new Error("Document not found"), { statusCode: 404 }), "production");
    expect(error.message).toBe("Document not found");
  });
});
