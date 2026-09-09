import { describe, it, expect } from "vitest";
import { chatPrompt, summaryPrompt } from "../utils/prompts.js";

describe("prompt truncation", () => {
  it("passes short documents through untouched, with no truncation notice", () => {
    const text = "A short document about photosynthesis.";
    const prompt = summaryPrompt(text);

    expect(prompt).toContain(text);
    expect(prompt).not.toContain("cut for length");
  });

  it("cuts long documents on a word boundary and tells the model it was cut", () => {
    const word = "lorem ";
    const longText = word.repeat(20000); // well over the 60K default ceiling
    const prompt = chatPrompt(longText, [], "What is this about?");

    expect(prompt.length).toBeLessThan(longText.length);
    expect(prompt).toContain("cut for length");
    // Boundary-aware: the excerpt shouldn't end mid-word.
    const excerpt = prompt.split("[NOTE:")[0];
    expect(excerpt.trimEnd().endsWith("lorem")).toBe(true);
  });
});
