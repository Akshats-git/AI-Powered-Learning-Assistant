import fs from "fs";
import path from "path";
import { PDFParse } from "pdf-parse";
import { createWorker } from "tesseract.js";

// A scanned PDF has no text layer, so pdf-parse's getText() comes back
// empty — there's nothing to chunk, embed, or prompt an LLM with. OCR is the
// fallback: render each page to an image and read it. Rendering + recognizing
// is seconds per page, and today it runs synchronously during upload (there's
// no job queue yet — see utils/ingest.js's header comment), so this caps how
// many pages it will attempt rather than let a 500-page scan hang the request
// indefinitely. A capped, partial result is still more useful than none.
export const OCR_MAX_PAGES = Number(process.env.OCR_MAX_PAGES) || 25;

// Left unset, tesseract.js downloads and caches the trained language model
// (~5MB) into the current working directory — pin it somewhere deliberate
// and gitignored instead of leaving that to whatever the process cwd happens
// to be.
const OCR_CACHE_PATH = path.join(process.cwd(), ".cache", "tesseract");
// tesseract.js writes the cached model here best-effort — a missing
// directory fails that write silently (just logged), so the model would
// silently re-download on every call instead of erroring loudly. Create it
// up front, the same way uploadMiddleware.js pre-creates the uploads dir.
fs.mkdirSync(OCR_CACHE_PATH, { recursive: true });

/**
 * OCRs a PDF's pages and returns the same shape documentController's
 * pdf-parse-based `extractText` does — `{ text, pages }`, pages as
 * `[{ num, text }]` joined by "\n\n" — so callers (chunking, page maps,
 * citations) don't need to know which extraction path produced the result.
 *
 * @returns `{ text, pages, pageCount, ocredPages, truncated }` — `pageCount`
 *   is the PDF's real page count; `ocredPages` is how many pages were
 *   actually read (capped at `maxPages`); `truncated` is true when the cap
 *   was hit before every page was read.
 */
export const ocrPdf = async (buffer, { maxPages = OCR_MAX_PAGES } = {}) => {
  const parser = new PDFParse({ data: buffer });
  try {
    const { total } = await parser.getInfo();
    const pageCount = total || 0;
    const pagesToRead = Math.min(pageCount, maxPages);

    if (pagesToRead === 0) {
      return { text: "", pages: [], pageCount, ocredPages: 0, truncated: pageCount > 0 };
    }

    const screenshots = await parser.getScreenshot({ scale: 2, first: pagesToRead, imageDataUrl: false });

    // One worker reused across every page (tesseract.js's own recommendation)
    // — recreating it per page would re-pay initialization cost for no
    // benefit, since recognition is sequential either way: it's CPU-bound,
    // and running pages in parallel would just contend for the same core.
    const worker = await createWorker("eng", 1, { cachePath: OCR_CACHE_PATH });
    const pages = [];
    try {
      for (const page of screenshots.pages) {
        const { data } = await worker.recognize(page.data);
        pages.push({ num: page.pageNumber, text: (data.text || "").trim() });
      }
    } finally {
      await worker.terminate();
    }

    return {
      text: pages.map((p) => p.text).join("\n\n"),
      pages,
      pageCount,
      ocredPages: pages.length,
      truncated: pagesToRead < pageCount,
    };
  } finally {
    await parser.destroy();
  }
};
