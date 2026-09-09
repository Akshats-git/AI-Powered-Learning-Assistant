import { describe, it, expect, afterEach } from "vitest";
import { modelForFeature, FEATURE_MODELS } from "../utils/modelRouting.js";

afterEach(() => {
  delete process.env.OPENAI_MODEL;
});

describe("modelForFeature", () => {
  it("routes quiz generation to the stronger model", () => {
    expect(modelForFeature("quiz")).toBe(FEATURE_MODELS.quiz);
    expect(modelForFeature("quiz")).toBe("gpt-4o");
  });

  it("defaults every other feature to the cheap model", () => {
    for (const feature of ["chat", "flashcards", "summary", "explain", "rerank", "groundedness", "query-rewrite", "unknown"]) {
      expect(modelForFeature(feature)).toBe("gpt-4o-mini");
    }
  });

  it("lets OPENAI_MODEL override routing entirely, even for quiz", () => {
    process.env.OPENAI_MODEL = "gpt-4o-nano";
    expect(modelForFeature("quiz")).toBe("gpt-4o-nano");
    expect(modelForFeature("chat")).toBe("gpt-4o-nano");
  });
});
