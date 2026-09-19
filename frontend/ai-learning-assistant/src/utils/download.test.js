import { describe, it, expect, vi, beforeEach } from "vitest";
import { saveBlob, filenameFromDisposition } from "./download";

describe("filenameFromDisposition", () => {
  it("reads a quoted filename", () => expect(filenameFromDisposition('attachment; filename="Cell-Biology.csv"', "x.csv")).toBe("Cell-Biology.csv"));
  it("reads an unquoted filename", () => expect(filenameFromDisposition("attachment; filename=deck.txt", "x.txt")).toBe("deck.txt"));
  it("falls back when the header is missing (e.g. not exposed cross-origin)", () => {
    expect(filenameFromDisposition(undefined, "fallback.csv")).toBe("fallback.csv");
    expect(filenameFromDisposition("attachment", "fallback.csv")).toBe("fallback.csv");
  });
});

describe("saveBlob", () => {
  beforeEach(() => {
    URL.createObjectURL = vi.fn(() => "blob:fake");
    URL.revokeObjectURL = vi.fn();
  });

  it("clicks a temporary download link with the given filename, then cleans it up", () => {
    let clicked;
    const spy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function () {
      clicked = { href: this.href, download: this.download };
    });
    saveBlob(new Blob(["a,b"]), "deck.csv");

    expect(clicked).toEqual({ href: "blob:fake", download: "deck.csv" });
    expect(document.querySelector("a[download]")).toBeNull();
    spy.mockRestore();
  });
});
