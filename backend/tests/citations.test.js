import { describe, it, expect } from "vitest";
import { buildRetrievedContext, toSources } from "../utils/citations.js";

describe("buildRetrievedContext", () => {
  it("labels each excerpt with its page and section", () => {
    const context = buildRetrievedContext([
      { text: "Mitochondria produce ATP.", page: 3, endPage: 3, sectionPath: ["Intro", "Cells"] },
    ]);

    expect(context).toContain("[Excerpt 1 — p. 3 — Intro > Cells]");
    expect(context).toContain("Mitochondria produce ATP.");
  });

  it("shows a page range when a chunk spans two pages", () => {
    const context = buildRetrievedContext([{ text: "spans pages", page: 5, endPage: 6, sectionPath: [] }]);
    expect(context).toContain("p. 5–6");
  });

  it("omits the page marker entirely when the document had no page map", () => {
    const context = buildRetrievedContext([{ text: "no page info", page: null, endPage: null, sectionPath: [] }]);
    expect(context).toBe("[Excerpt 1]\nno page info");
  });

  it("numbers excerpts in the order given, not sorted", () => {
    const context = buildRetrievedContext([
      { text: "first", page: 9, sectionPath: [] },
      { text: "second", page: 1, sectionPath: [] },
    ]);
    expect(context.indexOf("Excerpt 1")).toBeLessThan(context.indexOf("Excerpt 2"));
    expect(context.indexOf("p. 9")).toBeLessThan(context.indexOf("p. 1"));
  });

  it("returns an empty string for no chunks", () => {
    expect(buildRetrievedContext([])).toBe("");
    expect(buildRetrievedContext(undefined)).toBe("");
  });
});

describe("toSources", () => {
  it("carries chunk id, page range, and section through unchanged", () => {
    const [source] = toSources([{ id: "chunk-1", text: "short text", page: 4, endPage: 4, sectionPath: ["Methods"] }]);

    expect(source).toEqual({ chunkId: "chunk-1", page: 4, endPage: 4, sectionPath: ["Methods"], snippet: "short text" });
  });

  it("truncates a long chunk into a preview snippet", () => {
    const longText = "a".repeat(500);
    const [source] = toSources([{ id: "1", text: longText, page: 1, sectionPath: [] }]);

    expect(source.snippet.length).toBeLessThan(longText.length);
    expect(source.snippet.endsWith("…")).toBe(true);
  });

  it("defaults missing metadata instead of throwing", () => {
    const [source] = toSources([{ text: "bare chunk" }]);
    expect(source).toEqual({ chunkId: null, page: null, endPage: null, sectionPath: [], snippet: "bare chunk" });
  });

  it("returns an empty array for no chunks", () => {
    expect(toSources([])).toEqual([]);
    expect(toSources(undefined)).toEqual([]);
  });
});
