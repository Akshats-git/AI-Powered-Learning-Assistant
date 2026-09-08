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
