import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import app from "../app.js";
import Document from "../models/Document.js";
import { createUserWithToken } from "./helpers.js";

describe("GET /api/documents pagination", () => {
  let token;

  beforeEach(async () => {
    ({ token } = await createUserWithToken());
    const docs = Array.from({ length: 5 }, (_, i) => ({
      user: undefined,
      title: `Doc ${i}`,
      fileName: `doc-${i}.pdf`,
      filePath: `/tmp/doc-${i}.pdf`,
      fileSize: 10,
      mimeType: "application/pdf",
      extractedText: "content",
      hasExtractedText: true,
    }));
    // createUserWithToken doesn't expose the user id directly here, so fetch it back.
    const profile = await request(app).get("/api/auth/profile").set("Authorization", `Bearer ${token}`);
    const userId = profile.body.user._id;
    await Document.insertMany(docs.map((d) => ({ ...d, user: userId })));
  });

  it("defaults to page 1 with all results when under the default limit", async () => {
    const res = await request(app).get("/api/documents").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(5);
    expect(res.body.page).toBe(1);
    expect(res.body.total).toBe(5);
    expect(res.body.totalPages).toBe(1);
  });

  it("respects limit and page query params", async () => {
    const res = await request(app)
      .get("/api/documents?page=2&limit=2")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(2);
    expect(res.body.page).toBe(2);
    expect(res.body.totalPages).toBe(3);
  });

  it("clamps an excessive limit instead of trusting the client", async () => {
    const res = await request(app)
      .get("/api/documents?limit=9999")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.limit).toBeLessThanOrEqual(50);
  });
});
