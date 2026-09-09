import { describe, it, expect } from "vitest";
import { chatPrompt, summaryPrompt, retrievalChatPrompt } from "../utils/prompts.js";

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

describe("retrievalChatPrompt", () => {
  it("includes the retrieved excerpts, instructs page citations, and forbids outside knowledge", () => {
    const context = "[Excerpt 1 — p. 12]\nThe mitochondria is the powerhouse of the cell.";
    const prompt = retrievalChatPrompt(context, [], "What produces energy in a cell?");

    expect(prompt).toContain(context);
    expect(prompt).toMatch(/cite its page/i);
    expect(prompt).toMatch(/do not fall back on outside knowledge/i);
    expect(prompt).toContain("What produces energy in a cell?");
  });

  it("folds prior turns into the prompt the same way chatPrompt does", () => {
    const history = [
      { role: "user", content: "What is ATP?" },
      { role: "assistant", content: "ATP is the cell's energy currency." },
    ];
    const prompt = retrievalChatPrompt("[Excerpt 1]\nsome text", history, "Where is it produced?");

    expect(prompt).toContain("User: What is ATP?");
    expect(prompt).toContain("Assistant: ATP is the cell's energy currency.");
  });

  it("says there's no prior conversation on the first turn", () => {
    const prompt = retrievalChatPrompt("[Excerpt 1]\nsome text", [], "A question");
    expect(prompt).toContain("(no prior messages)");
  });
});
