import { describe, it, expect } from "vitest";
import { findSemanticMatch, SEMANTIC_CACHE_THRESHOLD } from "../utils/semanticCache.js";

describe("findSemanticMatch", () => {
  const candidates = [
    { id: "a", questionEmbedding: [1, 0, 0] },
    { id: "b", questionEmbedding: [0, 1, 0] },
  ];

  it("matches a near-identical question above the threshold", () => {
    const match = findSemanticMatch([0.999, 0.001, 0], candidates);
    expect(match.candidate.id).toBe("a");
    expect(match.score).toBeGreaterThanOrEqual(SEMANTIC_CACHE_THRESHOLD);
  });

  it("returns null when nothing clears the threshold", () => {
    // Orthogonal to both cached questions — not a rewording of either.
    expect(findSemanticMatch([0, 0, 1], candidates)).toBeNull();
  });

  it("returns the single best match when multiple candidates clear the threshold", () => {
    const closeCandidates = [
      { id: "close", questionEmbedding: [0.99, 0.14, 0] },
      { id: "closer", questionEmbedding: [0.999, 0.04, 0] },
    ];
    const match = findSemanticMatch([1, 0, 0], closeCandidates);
    expect(match.candidate.id).toBe("closer");
  });

  it("returns null for a missing query embedding or empty candidate list", () => {
    expect(findSemanticMatch(null, candidates)).toBeNull();
    expect(findSemanticMatch([1, 0, 0], [])).toBeNull();
  });

  it("respects a custom threshold", () => {
    // 0.5 similarity clears a loose threshold but not the strict default.
    const loose = findSemanticMatch([0.5, 0.5, 0], candidates, 0.5);
    const strict = findSemanticMatch([0.5, 0.5, 0], candidates, SEMANTIC_CACHE_THRESHOLD);
    expect(loose).not.toBeNull();
    expect(strict).toBeNull();
  });
});
