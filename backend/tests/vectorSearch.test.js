import { describe, it, expect } from "vitest";
import { cosineSimilarity, rankByCosineSimilarity } from "../utils/vectorSearch.js";

describe("cosineSimilarity", () => {
  it("is 1 for identical vectors and -1 for opposite ones", () => {
    expect(cosineSimilarity([1, 0], [1, 0])).toBeCloseTo(1, 10);
    expect(cosineSimilarity([1, 0], [-1, 0])).toBeCloseTo(-1, 10);
  });

  it("is 0 for orthogonal vectors", () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0, 10);
  });

  it("is scale-invariant — magnitude doesn't affect direction similarity", () => {
    expect(cosineSimilarity([1, 1], [2, 2])).toBeCloseTo(1, 10);
    expect(cosineSimilarity([1, 1], [50, 50])).toBeCloseTo(1, 10);
  });

  it("returns 0 rather than NaN for a zero vector or mismatched lengths", () => {
    expect(cosineSimilarity([0, 0], [1, 1])).toBe(0);
    expect(cosineSimilarity([1, 2, 3], [1, 2])).toBe(0);
    expect(cosineSimilarity(null, [1, 2])).toBe(0);
    expect(cosineSimilarity(undefined, undefined)).toBe(0);
  });
});

describe("rankByCosineSimilarity", () => {
  const items = [
    { id: "exact", embedding: [1, 0, 0] },
    { id: "close", embedding: [0.9, 0.1, 0] },
    { id: "unrelated", embedding: [0, 1, 0] },
    { id: "opposite", embedding: [-1, 0, 0] },
  ];

  it("ranks the closest vector first", () => {
    const results = rankByCosineSimilarity([1, 0, 0], items);
    expect(results[0].id).toBe("exact");
    expect(results[1].id).toBe("close");
  });

  it("drops non-positive similarity instead of ranking it last", () => {
    // An orthogonal or opposite chunk isn't "less relevant" — it's noise, and
    // hybridRetrieval relies on this list not including it.
    const results = rankByCosineSimilarity([1, 0, 0], items);
    expect(results.map((r) => r.id)).not.toContain("unrelated");
    expect(results.map((r) => r.id)).not.toContain("opposite");
  });

  it("respects the limit", () => {
    expect(rankByCosineSimilarity([1, 0, 0], items, 1)).toHaveLength(1);
  });

  it("returns nothing for a missing query embedding or empty item list", () => {
    expect(rankByCosineSimilarity(null, items)).toEqual([]);
    expect(rankByCosineSimilarity([1, 0, 0], [])).toEqual([]);
  });
});
