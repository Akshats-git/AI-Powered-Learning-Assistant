import { describe, it, expect } from "vitest";
import { chunkText, detectHeading, splitBlocks, estimateTokens } from "../utils/chunking.js";
import { buildPageMap, pageForOffset } from "../utils/pageMap.js";

const sentence = (i) => `Sentence number ${i} explains a concept in enough detail to be worth retrieving.`;
const paragraph = (n, offset = 0) => Array.from({ length: n }, (_, i) => sentence(i + offset)).join(" ");

describe("buildPageMap / pageForOffset", () => {
  const pages = [
    { num: 1, text: "alpha" },
    { num: 2, text: "beta" },
    { num: 3, text: "gamma" },
  ];

  it("maps each page onto its character range in the concatenated text", () => {
    const map = buildPageMap(pages);
    const text = pages.map((p) => p.text).join("\n\n");

    expect(map).toEqual([
      { page: 1, start: 0, end: 5 },
      { page: 2, start: 7, end: 11 },
      { page: 3, start: 13, end: 18 },
    ]);
    // The ranges have to describe the real string, not an idealised one.
    for (const { page, start, end } of map) {
      expect(text.slice(start, end)).toBe(pages[page - 1].text);
    }
  });

  it("attributes an offset in the joiner between pages to the page that ended", () => {
    const map = buildPageMap(pages);
    expect(pageForOffset(map, 4)).toBe(1);
    expect(pageForOffset(map, 5)).toBe(1);
    expect(pageForOffset(map, 7)).toBe(2);
  });

  it("returns null rather than guessing when there is no page map", () => {
    expect(pageForOffset([], 10)).toBeNull();
    expect(pageForOffset(undefined, 10)).toBeNull();
  });
});

describe("detectHeading", () => {
  it("recognises markdown, numbered, all-caps and title-case headings", () => {
    expect(detectHeading("## Background")).toEqual({ level: 2, title: "Background" });
    expect(detectHeading("3.2.1 Experimental Setup")).toEqual({ level: 3, title: "3.2.1 Experimental Setup" });
    expect(detectHeading("REFERENCES")).toEqual({ level: 1, title: "REFERENCES" });
    expect(detectHeading("Chapter 4")).toEqual({ level: 1, title: "Chapter 4" });
  });

  it("does not mistake prose for a heading", () => {
    expect(detectHeading("The spectral radius of the matrix is bounded above by one.")).toBeNull();
    expect(detectHeading("In this section we introduce the notation used throughout,")).toBeNull();
    // Multi-line blocks are paragraphs, however short each line is.
    expect(detectHeading("Introduction\nand overview")).toBeNull();
  });
});

describe("splitBlocks", () => {
  it("keeps every block's offsets into the original text", () => {
    const text = "First block.\n\n  Second block.\n\n\nThird block.";
    const blocks = splitBlocks(text);

    expect(blocks.map((b) => b.text)).toEqual(["First block.", "Second block.", "Third block."]);
    for (const block of blocks) {
      expect(text.slice(block.start, block.end)).toBe(block.text);
    }
  });
});

describe("chunkText", () => {
  const pages = [
    { num: 1, text: `# Introduction\n\n${paragraph(20)}` },
    { num: 2, text: `## 2.1 Methods\n\n${paragraph(30)}` },
    { num: 3, text: `RESULTS\n\n${paragraph(8)}` },
  ];
  const text = pages.map((p) => p.text).join("\n\n");
  const pageMap = buildPageMap(pages);

  it("produces chunks that are exact slices of the source", () => {
    // Without this, a citation quote can never be located in the document.
    for (const chunk of chunkText(text, { pageMap, targetTokens: 200 })) {
      expect(text.slice(chunk.charStart, chunk.charEnd)).toBe(chunk.text);
    }
  });

  it("stays near the target size instead of emitting one chunk per paragraph", () => {
    const chunks = chunkText(text, { pageMap, targetTokens: 200 });

    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      // Target plus the overlap window, with room for the sentence that
      // crossed the boundary.
      expect(chunk.tokens).toBeLessThanOrEqual(200 * 1.5);
    }
  });

  it("tags every chunk with the page it starts on", () => {
    const chunks = chunkText(text, { pageMap, targetTokens: 200 });

    expect(chunks[0].page).toBe(1);
    expect(chunks.some((c) => c.page === 2)).toBe(true);
    expect(chunks.at(-1).page).toBe(3);
    for (const chunk of chunks) {
      expect(chunk.endPage).toBeGreaterThanOrEqual(chunk.page);
    }
  });

  it("carries the heading trail so a chunk knows which section it came from", () => {
    const chunks = chunkText(text, { pageMap, targetTokens: 200 });

    expect(chunks[0].sectionPath).toEqual(["Introduction"]);
    // A level-2 heading nests under the level-1 one it follows...
    expect(chunks.find((c) => c.text.includes("2.1 Methods")).sectionPath).toEqual(["Introduction", "2.1 Methods"]);
    // ...and a level-1 heading pops it back off.
    expect(chunks.at(-1).sectionPath).toEqual(["RESULTS"]);
  });

  it("overlaps consecutive chunks on a word boundary", () => {
    const chunks = chunkText(text, { pageMap, targetTokens: 200, overlapRatio: 0.15 });
    const overlapping = chunks.filter((c, i) => i > 0 && c.charStart < chunks[i - 1].charEnd);

    expect(overlapping.length).toBeGreaterThan(0);
    for (const chunk of overlapping) {
      // A chunk starting mid-word ("...entence number 11") is a chunk whose
      // first term is garbage to both the embedder and BM25.
      expect(chunk.text).toMatch(/^[A-Z0-9]/);
    }
  });

  it("starts a new chunk at a heading rather than straddling two sections", () => {
    const chunks = chunkText(text, { pageMap, targetTokens: 200 });
    const methodsChunks = chunks.filter((c) => c.text.includes("2.1 Methods"));

    expect(methodsChunks).toHaveLength(1);
    expect(methodsChunks[0].text.startsWith("## 2.1 Methods")).toBe(true);
  });

  it("splits a paragraph that is bigger than a whole chunk on sentence boundaries", () => {
    const oneHugeParagraph = paragraph(60);
    const chunks = chunkText(oneHugeParagraph, { targetTokens: 150 });

    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.text.trimEnd().endsWith(".")).toBe(true);
    }
  });

  it("still terminates on text with no sentence or paragraph boundaries at all", () => {
    // A reference list or a table extracted as one unbroken run.
    const chunks = chunkText("x".repeat(20000), { targetTokens: 100 });

    expect(chunks.length).toBeGreaterThan(1);
    expect(Math.max(...chunks.map((c) => c.tokens))).toBeLessThanOrEqual(100 * 1.5);
  });

  it("returns nothing for an empty document instead of one empty chunk", () => {
    expect(chunkText("")).toEqual([]);
    expect(chunkText("   \n\n  ")).toEqual([]);
  });

  it("leaves the page fields null when the document has no page map", () => {
    const [chunk] = chunkText("A scanned page whose text came from somewhere else.");
    expect(chunk.page).toBeNull();
    expect(chunk.sectionPath).toEqual([]);
  });

  it("estimates tokens from length", () => {
    expect(estimateTokens("")).toBe(0);
    expect(estimateTokens("abcd")).toBe(1);
    expect(estimateTokens("a".repeat(400))).toBe(100);
  });
});
