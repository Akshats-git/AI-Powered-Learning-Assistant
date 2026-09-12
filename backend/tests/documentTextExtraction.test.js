import { describe, it, expect } from "vitest";
import path from "path";
import { fileURLToPath } from "url";
import request from "supertest";
import app from "../app.js";
import Document from "../models/Document.js";
import { createUserWithToken } from "./helpers.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TWO_PAGE_PDF = path.join(__dirname, "fixtures/two-page.pdf");

// Regression test: pdf-parse's own concatenated `result.text` splices a
// "-- N of M --" footer between every page, which desyncs buildPageMap's
// "\n\n"-only join after page 1 — every citation past the first page would
// point at the wrong page. documentController builds extractedText from the
// per-page array instead, specifically to avoid this.
describe("multi-page text extraction and page offsets", () => {
  it("keeps extractedText free of pdf-parse's page-footer markers", async () => {
    const { token } = await createUserWithToken();

    const res = await request(app)
      .post("/api/documents/upload")
      .set("Authorization", `Bearer ${token}`)
      .field("title", "Two Page Doc")
      .attach("file", TWO_PAGE_PDF);

    expect(res.status).toBe(201);

    const document = await Document.findById(res.body._id);
    expect(document.extractedText).not.toMatch(/-- \d+ of \d+ --/);
    expect(document.pageMap).toHaveLength(2);

    // The whole point of the page map: slicing extractedText at page 2's
    // recorded range must land exactly on page 2's real text.
    const page2 = document.pageMap.find((p) => p.page === 2);
    expect(document.extractedText.slice(page2.start, page2.end)).toBe("PAGE TWO TEX");
  });
});
