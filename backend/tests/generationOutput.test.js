import { describe, it, expect } from "vitest";
import { sanitizeFlashcards, sanitizeQuestions } from "../utils/generationOutput.js";

const D = ["easy", "medium", "hard"];

describe("sanitizeQuestions", () => {
  const ok = { question: "Capital of France?", options: ["Paris", "Rome", "Oslo", "Bern"], correctAnswer: "Paris", explanation: "geo", concept: "capitals" };

  it("keeps a good question and drops ones that can never be answered", () => {
    const out = sanitizeQuestions([ok, { ...ok, correctAnswer: "Madrid" }, { ...ok, options: ["only one"] }, { ...ok, question: "  " }, null]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ question: "Capital of France?", correctAnswer: "Paris" });
  });

  it("repairs a correctAnswer that differs by case or is given as a letter", () => {
    expect(sanitizeQuestions([{ ...ok, correctAnswer: "paris" }])[0].correctAnswer).toBe("Paris");
    expect(sanitizeQuestions([{ ...ok, correctAnswer: "B" }])[0].correctAnswer).toBe("Rome");
    expect(sanitizeQuestions([{ ...ok, correctAnswer: "(c)" }])[0].correctAnswer).toBe("Oslo");
  });

  it("de-duplicates options, and a concept quiz overrides the model's concept", () => {
    const out = sanitizeQuestions([{ ...ok, options: ["Paris", "Paris", "Rome"] }], { concept: "Europe" });
    expect(out[0].options).toEqual(["Paris", "Rome"]);
    expect(out[0].concept).toBe("Europe");
  });

  it("throws a 502 when nothing is usable (or the field isn't an array)", () => {
    expect(() => sanitizeQuestions([{ question: "x" }])).toThrow(/usable quiz questions/);
    try { sanitizeQuestions("nope"); } catch (e) { expect(e.statusCode).toBe(502); }
  });
});

describe("sanitizeFlashcards", () => {
  it("drops cards missing a side, trims, and defaults a bad difficulty", () => {
    const out = sanitizeFlashcards([{ question: " Q ", answer: " A ", difficulty: "wild" }, { question: "no answer" }, { answer: "no question" }], D);
    expect(out).toEqual([{ question: "Q", answer: "A", difficulty: "medium" }]);
  });

  it("throws a 502 when no card survives", () => {
    expect(() => sanitizeFlashcards([], D)).toThrow(/usable flashcards/);
  });
});
