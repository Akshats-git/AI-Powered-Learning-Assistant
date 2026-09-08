import { describe, it, expect } from "vitest";
import { estimateCostUsd } from "../utils/aiClient.js";

describe("estimateCostUsd", () => {
  it("computes cost from prompt and completion tokens for a known model", () => {
    const cost = estimateCostUsd("gpt-4o-mini", { prompt_tokens: 1_000_000, completion_tokens: 1_000_000 });
    expect(cost).toBeCloseTo(0.15 + 0.6, 5);
  });

  it("returns null for an unlisted model", () => {
    expect(estimateCostUsd("some-future-model", { prompt_tokens: 100, completion_tokens: 50 })).toBeNull();
  });

  it("returns null when usage is missing", () => {
    expect(estimateCostUsd("gpt-4o-mini", undefined)).toBeNull();
  });
});
