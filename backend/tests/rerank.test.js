import { describe, it, expect } from "vitest";
import { applyRerankScores, buildRerankPrompt } from "../utils/rerank.js";

const candidates = [
  { id: "a", text: "General discussion of cellular respiration." },
  { id: "b", text: "The stock market closed lower on Tuesday." },
  { id: "c", text: "ATP synthase drives the final step of respiration." },
];

describe("applyRerankScores", () => {
  it("reorders candidates by the model's relevance scores, best first", () => {
    const reordered = applyRerankScores(
      candidates,
      { scores: [{ index: 0, score: 6 }, { index: 1, score: 0 }, { index: 2, score: 9 }] },
      3
    );

    expect(reordered.map((c) => c.id)).toEqual(["c", "a", "b"]);
  });

  it("attaches each scored candidate's relevance so citations can filter on it", () => {
    const reordered = applyRerankScores(candidates, { scores: [{ index: 0, score: 6 }, { index: 2, score: 9 }] }, 3);
    expect(reordered.find((c) => c.id === "c").relevance).toBe(9);
    expect(reordered.find((c) => c.id === "a").relevance).toBe(6);
    expect(reordered.find((c) => c.id === "b")).not.toHaveProperty("relevance");
  });

  it("truncates to the requested limit", () => {
    const reordered = applyRerankScores(
      candidates,
      { scores: [{ index: 0, score: 6 }, { index: 1, score: 1 }, { index: 2, score: 9 }] },
      2
    );

    expect(reordered).toHaveLength(2);
    expect(reordered.map((c) => c.id)).toEqual(["c", "a"]);
  });

  it("falls back to the original (fused) order for a candidate the model didn't score", () => {
    // Only index 2 got a real score; 0 and 1 keep their relative fused order
    // rather than being dropped or randomly placed.
    const reordered = applyRerankScores(candidates, { scores: [{ index: 2, score: 10 }] }, 3);

    expect(reordered.map((c) => c.id)).toEqual(["c", "a", "b"]);
  });

  it("degrades to the fused order unchanged when the response has no usable scores at all", () => {
    expect(applyRerankScores(candidates, {}, 3).map((c) => c.id)).toEqual(["a", "b", "c"]);
    expect(applyRerankScores(candidates, { scores: [] }, 3).map((c) => c.id)).toEqual(["a", "b", "c"]);
    expect(applyRerankScores(candidates, null, 3).map((c) => c.id)).toEqual(["a", "b", "c"]);
  });

  it("ignores a malformed entry (out-of-range index, non-numeric score) instead of throwing", () => {
    const reordered = applyRerankScores(
      candidates,
      { scores: [{ index: 99, score: 10 }, { index: 0, score: "high" }, { index: 1, score: 5 }] },
      3
    );

    expect(reordered).toHaveLength(3);
    expect(reordered.map((c) => c.id)).toContain("b");
  });
});

describe("buildRerankPrompt", () => {
  it("previews the passage that matches the query, not the chunk's unrelated opening", () => {
    const filler = "Lorem ipsum dolor sit amet consectetur adipiscing elit. ".repeat(20);
    const prompt = buildRerankPrompt("What does Theorem 4.2 state?", [
      { text: `${filler}Theorem 4.2 states that bounded monotone sequences converge. ${filler}` },
    ]);

    expect(prompt).toContain("Theorem 4.2 states that bounded monotone sequences converge");
  });

  it("keeps each preview on one line so the [index] list stays parseable", () => {
    const prompt = buildRerankPrompt("atp", [{ text: "line one\n\nline two about ATP\nline three" }, { text: "other" }]);
    const lines = prompt.split("\n").filter((l) => /^\[\d+\] /.test(l));
    expect(lines).toHaveLength(2);
  });
});
