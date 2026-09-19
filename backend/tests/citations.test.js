import { describe, it, expect } from "vitest";
import { buildRetrievedContext, toSources, findBestSnippet, filterRelevantSources } from "../utils/citations.js";

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

describe("findBestSnippet", () => {
  const filler = "Lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor. ";
  const text = `${filler.repeat(10)}Theorem 4.2 states that every bounded monotone sequence converges. ${filler.repeat(10)}`;

  it("centres the snippet on the passage that matches the query, not the start of the chunk", () => {
    const { snippet, matchOffset } = findBestSnippet(text, "What does Theorem 4.2 say about monotone sequence convergence?");
    expect(snippet).toContain("bounded monotone sequence converges");
    expect(snippet.startsWith("…")).toBe(true);
    expect(matchOffset).toBe(text.indexOf("Theorem"));
  });

  it("prefers the window covering the most distinct query terms over the first single hit", () => {
    const t = `${"x ".repeat(200)}alpha ${"y ".repeat(200)}alpha beta gamma together here ${"z ".repeat(200)}`;
    const { snippet } = findBestSnippet(t, "alpha beta gamma");
    expect(snippet).toContain("alpha beta gamma together");
  });

  it("falls back to the head of the chunk when nothing matches, or the query has only stopwords", () => {
    expect(findBestSnippet(text, "zebra quartz").matchOffset).toBeNull();
    expect(findBestSnippet(text, "zebra quartz").snippet.startsWith("Lorem")).toBe(true);
    expect(findBestSnippet(text, "what is the").matchOffset).toBeNull();
  });

  it("returns short text whole, without ellipses", () => {
    expect(findBestSnippet("short text about ATP", "ATP").snippet).toBe("short text about ATP");
  });
});

describe("toSources with a query and page map", () => {
  const pageMap = [
    { page: 1, start: 0, end: 99 },
    { page: 2, start: 101, end: 300 },
    { page: 3, start: 302, end: 500 },
  ];
  const chunk = { id: "c", text: `${"a ".repeat(100)}needle phrase here ${"b ".repeat(20)}`, page: 1, endPage: 3, sectionPath: [], charStart: 50 };

  it("reports the exact page the matching passage is on, not just the chunk's page range", () => {
    const [source] = toSources([chunk], { query: "needle phrase", pageMap });
    // offset 200 inside the chunk + charStart 50 = 250 -> page 2
    expect(source.snippetPage).toBe(2);
    expect(source.page).toBe(1);
    expect(source.endPage).toBe(3);
    expect(source.snippet).toContain("needle phrase");
  });

  it("omits snippetPage when there is no page map, no charStart, or no match", () => {
    expect(toSources([chunk], { query: "needle" })[0]).not.toHaveProperty("snippetPage");
    expect(toSources([{ ...chunk, charStart: undefined }], { query: "needle", pageMap })[0]).not.toHaveProperty("snippetPage");
    expect(toSources([chunk], { query: "zebra", pageMap })[0]).not.toHaveProperty("snippetPage");
  });

  it("passes a rerank relevance score through", () => {
    expect(toSources([{ ...chunk, relevance: 8 }])[0].relevance).toBe(8);
  });
});

describe("filterRelevantSources", () => {
  it("drops sources the reranker scored below the threshold, keeping order", () => {
    const kept = filterRelevantSources([{ chunkId: "a", relevance: 9 }, { chunkId: "b", relevance: 1 }, { chunkId: "c", relevance: 4 }]);
    expect(kept.map((s) => s.chunkId)).toEqual(["a", "c"]);
  });

  it("keeps unscored sources (rerank was skipped)", () => {
    expect(filterRelevantSources([{ chunkId: "a" }, { chunkId: "b" }])).toHaveLength(2);
  });

  it("always keeps at least the top source, even if everything scored low", () => {
    expect(filterRelevantSources([{ chunkId: "a", relevance: 0 }, { chunkId: "b", relevance: 0 }]).map((s) => s.chunkId)).toEqual(["a"]);
  });

  it("returns [] for no sources", () => {
    expect(filterRelevantSources([])).toEqual([]);
    expect(filterRelevantSources(undefined)).toEqual([]);
  });
});
