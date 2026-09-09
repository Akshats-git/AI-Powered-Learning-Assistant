import { describe, it, expect } from "vitest";
import { hybridSearch } from "../utils/hybridRetrieval.js";

// Every chunk gets a distinct embedding "direction" so cosine similarity can
// tell them apart; the text carries the lexical signal (an exact term) that
// BM25 alone would find. This lets each test control which retriever "wins".
const chunks = [
  { id: "vector-match", text: "General discussion of cellular respiration and energy metabolism.", embedding: [1, 0, 0] },
  { id: "lexical-match", text: "Theorem 4.2 establishes the bound via the spectral radius.", embedding: [0, 1, 0] },
  { id: "both-match", text: "Theorem 4.2 also appears in the context of cellular respiration.", embedding: [0.9, 0.1, 0] },
  { id: "neither", text: "An unrelated paragraph about grocery logistics.", embedding: [0, 0, 1] },
];

describe("hybridSearch", () => {
  it("ranks a chunk both retrievers agree on above either one's sole favourite", () => {
    const results = hybridSearch({
      query: "Theorem 4.2 cellular respiration",
      queryEmbedding: [1, 0, 0],
      chunks,
    });

    expect(results[0].id).toBe("both-match");
  });

  it("still finds a chunk only the lexical side would surface", () => {
    const results = hybridSearch({ query: "Theorem 4.2", queryEmbedding: [0, 0, -1], chunks });
    expect(results.map((r) => r.id)).toContain("lexical-match");
  });

  it("still finds a chunk only the vector side would surface", () => {
    const results = hybridSearch({ query: "grocery logistics unrelated", queryEmbedding: [1, 0, 0], chunks });
    expect(results.map((r) => r.id)).toContain("vector-match");
  });

  it("falls back to lexical-only when there's no query embedding yet", () => {
    const results = hybridSearch({ query: "Theorem 4.2", queryEmbedding: null, chunks });

    expect(results.map((r) => r.id)).toContain("lexical-match");
    expect(results.every((r) => r.ranks.vector === null)).toBe(true);
  });

  it("reports each result's rank in both retrievers for explainability", () => {
    const results = hybridSearch({ query: "Theorem 4.2 cellular respiration", queryEmbedding: [1, 0, 0], chunks });
    const bothMatch = results.find((r) => r.id === "both-match");

    expect(bothMatch.ranks.vector).toBe(2);
    expect(bothMatch.ranks.lexical).toBe(1);
    expect(typeof bothMatch.score).toBe("number");
  });

  it("respects the limit", () => {
    const results = hybridSearch({ query: "Theorem 4.2 cellular respiration", queryEmbedding: [1, 0, 0], chunks, limit: 2 });
    expect(results).toHaveLength(2);
  });

  it("returns the chunk's own fields (text, page, etc.) alongside the fusion metadata", () => {
    const results = hybridSearch({ query: "Theorem 4.2", queryEmbedding: [1, 0, 0], chunks });
    expect(results[0].text).toBeTruthy();
  });

  it("returns nothing for an empty chunk list", () => {
    expect(hybridSearch({ query: "anything", queryEmbedding: [1, 0, 0], chunks: [] })).toEqual([]);
  });
});
