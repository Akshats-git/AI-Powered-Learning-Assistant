import { describe, it, expect } from "vitest";
import request from "supertest";
import app from "../app.js";
import { createUserWithToken } from "./helpers.js";

const OID = "64b7f0f2a1b2c3d4e5f60718";

describe("AI input limits", () => {
  it.each([
    ["/api/ai/chat", { documentId: OID, message: "x".repeat(4001) }],
    ["/api/ai/chat/stream", { documentId: OID, message: "x".repeat(4001) }],
    ["/api/ai/explain", { documentId: OID, concept: "x".repeat(201) }],
  ])("%s rejects an oversized field before doing any work", async (path, body) => {
    const { token } = await createUserWithToken();
    const res = await request(app).post(path).set("Authorization", `Bearer ${token}`).send(body);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });
});
