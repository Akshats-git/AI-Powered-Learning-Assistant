import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import { usePageTitle, titleForPath } from "./usePageTitle";

describe("usePageTitle", () => {
  it("sets '<title> · StudyAI'", () => {
    renderHook(() => usePageTitle("Documents"));
    expect(document.title).toBe("Documents · StudyAI");
  });

  it("falls back to the app name with no title, and follows changes", () => {
    const { rerender } = renderHook(({ t }) => usePageTitle(t), { initialProps: { t: undefined } });
    expect(document.title).toBe("StudyAI");
    rerender({ t: "Biology.pdf" });
    expect(document.title).toBe("Biology.pdf · StudyAI");
  });
});

describe("titleForPath", () => {
  it.each([
    ["/dashboard", "Dashboard"],
    ["/documents", "Documents"],
    ["/documents/abc123/flashcards", "Flashcards"],
    ["/quizzes/abc123/results", "Quiz results"],
    ["/quizzes/abc123", "Quiz"],
    ["/admin/costs", "Cost dashboard"],
  ])("%s -> %s", (path, title) => expect(titleForPath(path)).toBe(title));

  it("returns null for dynamic or unknown routes so the page can set its own", () => {
    expect(titleForPath("/documents/abc123")).toBeNull();
    expect(titleForPath("/nope")).toBeNull();
  });
});
