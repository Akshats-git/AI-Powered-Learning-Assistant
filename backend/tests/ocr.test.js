import { describe, it, expect } from "vitest";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { ocrPdf } from "../utils/ocr.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCANNED_PDF = path.join(__dirname, "fixtures/scanned.pdf");

describe("ocrPdf", () => {
  it("recognizes text rendered into a page image with no text layer", async () => {
    const buffer = await fs.readFile(SCANNED_PDF);
    const result = await ocrPdf(buffer);

    expect(result.text.toUpperCase()).toContain("SCANNED");
    expect(result.pageCount).toBe(1);
    expect(result.ocredPages).toBe(1);
    expect(result.truncated).toBe(false);
    expect(result.pages).toEqual([{ num: 1, text: result.text }]);
  }, 30000);

  it("caps how many pages it reads and reports the result as truncated", async () => {
    const buffer = await fs.readFile(SCANNED_PDF);
    const result = await ocrPdf(buffer, { maxPages: 0 });

    expect(result.ocredPages).toBe(0);
    expect(result.pages).toEqual([]);
    expect(result.text).toBe("");
    expect(result.pageCount).toBe(1);
    expect(result.truncated).toBe(true);
  });
});
