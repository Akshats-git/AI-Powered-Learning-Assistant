import { describe, it, expect, afterEach } from "vitest";
import { modelForFeature, FEATURE_MODELS } from "../utils/modelRouting.js";

afterEach(() => {
  delete process.env.OPENAI_MODEL;
  delete process.env.OPENAI_QUIZ_MODEL;
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

  it("keeps routing quiz to the stronger model when OPENAI_MODEL is set to the cheap one (the documented deploy config)", () => {
    process.env.OPENAI_MODEL = "gpt-4o-mini";
    expect(modelForFeature("quiz")).toBe("gpt-4o");
  });

  it("uses OPENAI_MODEL as the default for features that have no route", () => {
    process.env.OPENAI_MODEL = "gpt-4o-nano";
    expect(modelForFeature("chat")).toBe("gpt-4o-nano");
    expect(modelForFeature("rerank")).toBe("gpt-4o-nano");
    expect(modelForFeature("quiz")).toBe("gpt-4o");
  });

  it("lets OPENAI_QUIZ_MODEL override only the quiz route", () => {
    process.env.OPENAI_QUIZ_MODEL = "gpt-4o-mini";
    expect(modelForFeature("quiz")).toBe("gpt-4o-mini");
    process.env.OPENAI_MODEL = "gpt-4o-nano";
    expect(modelForFeature("chat")).toBe("gpt-4o-nano");
  });
});
