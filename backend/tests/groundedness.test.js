import { describe, it, expect } from "vitest";
import { parseGroundednessResponse, buildGroundednessPrompt } from "../utils/groundedness.js";

describe("buildGroundednessPrompt", () => {
  it("includes both the answer and the source excerpts to check it against", () => {
    const prompt = buildGroundednessPrompt("The mitochondria produces ATP.", "[Excerpt 1 — p. 4]\nThe mitochondria is the powerhouse of the cell.");

    expect(prompt).toContain("The mitochondria produces ATP.");
    expect(prompt).toContain("The mitochondria is the powerhouse of the cell.");
    expect(prompt).toMatch(/NOT clearly supported/);
  });
});

describe("parseGroundednessResponse", () => {
  it("passes through a well-formed fully-grounded response", () => {
    expect(parseGroundednessResponse({ grounded: true, unsupportedClaims: [] })).toEqual({
      grounded: true,
      unsupportedClaims: [],
    });
  });

  it("passes through a well-formed response with unsupported claims", () => {
    const result = parseGroundednessResponse({ grounded: false, unsupportedClaims: ["The study covered 10,000 patients."] });
    expect(result).toEqual({ grounded: false, unsupportedClaims: ["The study covered 10,000 patients."] });
  });

  it("treats grounded:true with a non-empty unsupportedClaims list as ungrounded — the claims list is the source of truth", () => {
    const result = parseGroundednessResponse({ grounded: true, unsupportedClaims: ["A claim the model flagged but forgot to flip grounded for."] });
    expect(result.grounded).toBe(false);
  });

  it("drops empty or non-string entries from unsupportedClaims instead of keeping garbage", () => {
    const result = parseGroundednessResponse({ grounded: false, unsupportedClaims: ["Real claim", "", "   ", 42, null] });
    expect(result.unsupportedClaims).toEqual(["Real claim"]);
  });

  it("returns null (not verified) for a response missing the expected fields", () => {
    expect(parseGroundednessResponse({})).toBeNull();
    expect(parseGroundednessResponse({ grounded: true })).toBeNull();
    expect(parseGroundednessResponse({ unsupportedClaims: [] })).toBeNull();
    expect(parseGroundednessResponse({ grounded: "yes", unsupportedClaims: [] })).toBeNull();
  });

  it("returns null for null/undefined input rather than throwing", () => {
    expect(parseGroundednessResponse(null)).toBeNull();
    expect(parseGroundednessResponse(undefined)).toBeNull();
  });
});
