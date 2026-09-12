import { describe, it, expect } from "vitest";
import path from "path";
import { fileURLToPath } from "url";
import request from "supertest";
import app from "../app.js";
import { createUserWithToken } from "./helpers.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCANNED_PDF = path.join(__dirname, "fixtures/scanned.pdf");

describe("OCR fallback for scanned PDFs", () => {
  it("recovers text via OCR when the PDF has no native text layer", async () => {
    const { token } = await createUserWithToken();

    const res = await request(app)
      .post("/api/documents/upload")
      .set("Authorization", `Bearer ${token}`)
      .field("title", "Scanned Doc")
      .attach("file", SCANNED_PDF);

    expect(res.status).toBe(201);
    expect(res.body.hasExtractedText).toBe(true);
    expect(res.body.textSource).toBe("ocr");
    expect(res.body.ocrTruncated).toBe(false);
  }, 30000);
});
