import { describe, it, expect } from "vitest";
import { createBm25Index, tokenize } from "../utils/bm25.js";
import { reciprocalRankFusion, RRF_K } from "../utils/rrf.js";

describe("tokenize", () => {
  it("keeps the exact terms that are the reason BM25 is in the pipeline", () => {
    // Split these on punctuation and "Theorem 4.2" becomes "theorem" + "4" +
    // "2", which matches every theorem in the document.
    expect(tokenize("Theorem 4.2 bounds O(n) for state-of-the-art models")).toEqual([
      "theorem",
      "4.2",
      "bounds",
      "o",
      "n",
      "for",
      "state-of-the-art",
      "models",
    ]);
  });

  it("returns an empty list for text with no terms", () => {
    expect(tokenize("")).toEqual([]);
    expect(tokenize("!!! ??? ...")).toEqual([]);
  });
});

describe("createBm25Index", () => {
  const docs = [
    { id: "a", text: "The proof of Theorem 4.2 relies on the spectral radius of the transition matrix." },
    { id: "b", text: "Photosynthesis converts light energy into chemical energy inside plant cells." },
    { id: "c", text: "Theorem 4.1 is a strictly weaker statement about convergence rates." },
  ];

  it("ranks the chunk containing the exact term first", () => {
    const results = createBm25Index(docs).search("Theorem 4.2");

    expect(results[0].id).toBe("a");
    expect(results[0].score).toBeGreaterThan(results[1].score);
  });

  it("drops chunks that share no term with the query rather than ranking them last", () => {
    const results = createBm25Index(docs).search("Theorem 4.2");
    expect(results.map((r) => r.id)).not.toContain("b");
  });

  it("weights a rare term above a common one", () => {
    // "theorem" appears in two of three documents, "photosynthesis" in one.
    const index = createBm25Index(docs);
    const rare = index.search("photosynthesis")[0].score;
    const common = index.search("theorem")[0].score;

    expect(rare).toBeGreaterThan(common);
  });

  it("does not simply prefer longer chunks that repeat a term", () => {
    const index = createBm25Index([
      { id: "short", text: "Mitochondria produce ATP." },
      { id: "padded", text: `Mitochondria mitochondria mitochondria. ${"Unrelated filler sentence. ".repeat(60)}` },
    ]);

    expect(index.search("mitochondria")[0].id).toBe("short");
  });

  it("returns nothing for an empty query or an empty index", () => {
    expect(createBm25Index(docs).search("")).toEqual([]);
    expect(createBm25Index([]).search("theorem")).toEqual([]);
  });

  it("respects the result limit", () => {
    expect(createBm25Index(docs).search("theorem convergence radius", 1)).toHaveLength(1);
  });
});

describe("reciprocalRankFusion", () => {
  it("ranks a result both retrievers found above one retriever's favourite", () => {
    // "vector-only" is the embedding search's top hit and the lexical search
    // never saw it; "agreed" is only second in each list but appears in both.
    // Two moderate votes beating one strong one is the entire point of RRF —
    // it is what stops a single retriever's blind spot from deciding the
    // answer, and 1/(k+2) + 1/(k+2) > 1/(k+1) is why it works.
    const fused = reciprocalRankFusion([
      ["vector-only", "agreed"],
      ["lexical-only", "agreed"],
    ]);

    expect(fused[0].id).toBe("agreed");
  });

  it("scores by rank position, so an incomparable score scale never leaks in", () => {
    const fused = reciprocalRankFusion([["x", "y"]]);

    expect(fused[0].score).toBeCloseTo(1 / (RRF_K + 1), 10);
    expect(fused[1].score).toBeCloseTo(1 / (RRF_K + 2), 10);
  });

  it("reports where each id ranked in each list so a fused result is explainable", () => {
    const fused = reciprocalRankFusion([
      ["a", "b"],
      ["b", "d"],
    ]);

    expect(fused.find((f) => f.id === "a").ranks).toEqual([1, null]);
    expect(fused.find((f) => f.id === "b").ranks).toEqual([2, 1]);
    expect(fused.find((f) => f.id === "d").ranks).toEqual([null, 2]);
  });

  it("lets a retriever be weighted without changing the other's ranking", () => {
    const even = reciprocalRankFusion([["a"], ["b"]]);
    const lexicalHeavy = reciprocalRankFusion([["a"], ["b"]], { weights: [1, 3] });

    expect(even[0].id).toBe("a");
    expect(lexicalHeavy[0].id).toBe("b");
  });

  it("keeps an id's best position when one list repeats it", () => {
    const fused = reciprocalRankFusion([["a", "b", "a"]]);

    expect(fused).toHaveLength(2);
    expect(fused.find((f) => f.id === "a").ranks).toEqual([1]);
  });

  it("handles empty and missing lists", () => {
    expect(reciprocalRankFusion([])).toEqual([]);
    expect(reciprocalRankFusion([[], ["a"]]).map((f) => f.id)).toEqual(["a"]);
    expect(reciprocalRankFusion(undefined)).toEqual([]);
  });
});
