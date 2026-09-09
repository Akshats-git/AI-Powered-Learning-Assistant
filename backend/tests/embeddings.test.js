import { describe, it, expect } from "vitest";
import { estimateEmbeddingCostUsd, hashChunkText } from "../utils/embeddings.js";

describe("estimateEmbeddingCostUsd", () => {
  it("computes cost from total tokens for a known model", () => {
    expect(estimateEmbeddingCostUsd("text-embedding-3-small", 1_000_000)).toBeCloseTo(0.02, 6);
  });

  it("returns null for an unlisted model or missing token count", () => {
    expect(estimateEmbeddingCostUsd("some-future-model", 1000)).toBeNull();
    expect(estimateEmbeddingCostUsd("text-embedding-3-small", undefined)).toBeNull();
    expect(estimateEmbeddingCostUsd("text-embedding-3-small", NaN)).toBeNull();
  });
});

describe("hashChunkText", () => {
  it("is deterministic for identical text", () => {
    expect(hashChunkText("The mitochondria is the powerhouse of the cell.")).toBe(
      hashChunkText("The mitochondria is the powerhouse of the cell.")
    );
  });

  it("differs for different text — this is the whole re-embedding cache key", () => {
    expect(hashChunkText("a")).not.toBe(hashChunkText("b"));
  });

  it("handles empty/undefined text without throwing", () => {
    expect(hashChunkText("")).toBe(hashChunkText(undefined));
    expect(() => hashChunkText()).not.toThrow();
  });
});
