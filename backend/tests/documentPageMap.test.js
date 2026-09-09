import { describe, it, expect } from "vitest";
import path from "path";
import { fileURLToPath } from "url";
import request from "supertest";
import app from "../app.js";
import Document from "../models/Document.js";
import { createUserWithToken } from "./helpers.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SAMPLE_PDF = path.join(__dirname, "../../e2e/tests/fixtures/sample.pdf");

// Page numbers are unrecoverable once a PDF is flattened into one string —
// they have to be captured at parse time or a citation can never say "page
// 42" later. This is the regression test for that capture actually happening
// on the real upload path, not just in the buildPageMap unit tests.
describe("page map capture on upload", () => {
  it("records a pageCount and a pageMap whose ranges cover the stored text", async () => {
    const { token } = await createUserWithToken();

    const uploadRes = await request(app)
      .post("/api/documents/upload")
      .set("Authorization", `Bearer ${token}`)
      .field("title", "Paged Upload")
      .attach("file", SAMPLE_PDF);

    expect(uploadRes.status).toBe(201);
    expect(uploadRes.body.pageCount).toBeGreaterThan(0);
    // Retrieval machinery, not client-facing — never on the response.
    expect(uploadRes.body.pageMap).toBeUndefined();

    const stored = await Document.findById(uploadRes.body._id);
    expect(stored.pageMap).toHaveLength(stored.pageCount);
    expect(stored.pageMap[0]).toMatchObject({ page: 1, start: 0 });

    for (const { start, end } of stored.pageMap) {
      expect(end).toBeGreaterThanOrEqual(start);
      expect(end).toBeLessThanOrEqual(stored.extractedText.length);
    }
  });

  it("never leaks pageMap through the list endpoint either", async () => {
    const { token } = await createUserWithToken();
    await request(app)
      .post("/api/documents/upload")
      .set("Authorization", `Bearer ${token}`)
      .field("title", "Listed Upload")
      .attach("file", SAMPLE_PDF);

    const listRes = await request(app).get("/api/documents").set("Authorization", `Bearer ${token}`);

    expect(listRes.status).toBe(200);
    expect(listRes.body.items.every((d) => d.pageMap === undefined)).toBe(true);
  });
});
