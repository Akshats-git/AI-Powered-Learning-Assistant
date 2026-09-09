import { describe, it, expect } from "vitest";
import { selectChunksForBudget } from "../utils/contextSelection.js";

const makeChunks = (count, charsEach) =>
  Array.from({ length: count }, (_, i) => ({ index: i, text: "x".repeat(charsEach) }));

describe("selectChunksForBudget", () => {
  it("returns every chunk unchanged when the whole document already fits", () => {
    const chunks = makeChunks(5, 100);
    expect(selectChunksForBudget(chunks, { maxChars: 10000 })).toBe(chunks);
  });

  it("samples across the whole document instead of just the front, once it doesn't fit", () => {
    // The exact bug this replaces: a raw slice(0, budget) would only ever
    // return chunks 0 and 1, and the document's last 18 chunks would be
    // invisible to the model no matter how relevant they were.
    const chunks = makeChunks(20, 1000);
    const selected = selectChunksForBudget(chunks, { maxChars: 5000 });

    expect(selected[0].index).toBe(0);
    expect(selected.at(-1).index).toBe(19);
    expect(selected.some((c) => c.index > 5 && c.index < 15)).toBe(true);
  });

  it("keeps the selection within the character budget", () => {
    const chunks = makeChunks(50, 800);
    const selected = selectChunksForBudget(chunks, { maxChars: 6000 });
    const totalChars = selected.reduce((sum, c) => sum + c.text.length, 0);

    expect(totalChars).toBeLessThanOrEqual(6000);
  });

  it("returns chunks in original document order, not sampling order", () => {
    const chunks = makeChunks(30, 500);
    const selected = selectChunksForBudget(chunks, { maxChars: 4000 });
    const indices = selected.map((c) => c.index);

    expect(indices).toEqual([...indices].sort((a, b) => a - b));
  });

  it("always returns at least one chunk, even if it alone exceeds the budget", () => {
    const chunks = makeChunks(3, 10000);
    const selected = selectChunksForBudget(chunks, { maxChars: 100 });

    expect(selected).toHaveLength(1);
    expect(selected[0].index).toBe(0);
  });

  it("never duplicates a chunk even when rounding could collide", () => {
    const chunks = makeChunks(7, 900);
    const selected = selectChunksForBudget(chunks, { maxChars: 3000 });
    const indices = selected.map((c) => c.index);

    expect(new Set(indices).size).toBe(indices.length);
  });

  it("handles an empty chunk list", () => {
    expect(selectChunksForBudget([])).toEqual([]);
    expect(selectChunksForBudget(undefined)).toEqual([]);
  });
});
