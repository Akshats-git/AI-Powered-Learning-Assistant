import { describe, it, expect } from "vitest";
import { fuzzyScore, fuzzyFilter } from "./fuzzy";

describe("fuzzyScore", () => {
  it("matches an in-order subsequence and rejects anything else", () => {
    expect(fuzzyScore("dsh", "Dashboard")).toBeGreaterThan(0);
    expect(fuzzyScore("hsd", "Dashboard")).toBe(-1);
    expect(fuzzyScore("xyz", "Dashboard")).toBe(-1);
  });

  it("scores everything 0 for an empty query (so nothing is filtered out)", () => {
    expect(fuzzyScore("", "Anything")).toBe(0);
    expect(fuzzyScore("   ", "Anything")).toBe(0);
  });

  it("is case-insensitive", () => expect(fuzzyScore("DASH", "dashboard")).toBeGreaterThan(0));

  it("prefers a contiguous match at a word start over a scattered one", () => {
    expect(fuzzyScore("quiz", "Quizzes")).toBeGreaterThan(fuzzyScore("quiz", "Q u i extra z"));
  });

  it("prefers the shorter target on an equal match", () => {
    expect(fuzzyScore("flash", "Flashcards")).toBeGreaterThan(fuzzyScore("flash", "Flashcards and everything else"));
  });
});

describe("fuzzyFilter", () => {
  const items = [{ label: "Dashboard" }, { label: "Documents" }, { label: "Profile" }];

  it("drops non-matches and ranks the rest", () => {
    expect(fuzzyFilter(items, "do", (i) => i.label).map((i) => i.label)).toEqual(["Documents", "Dashboard"]);
  });

  it("returns everything for an empty query, in the original order", () => {
    expect(fuzzyFilter(items, "", (i) => i.label)).toEqual(items);
  });
});
