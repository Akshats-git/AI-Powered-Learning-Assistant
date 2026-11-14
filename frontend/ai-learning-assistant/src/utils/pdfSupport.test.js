import { describe, it, expect, afterEach, vi } from "vitest";
import { shouldUsePdfJs } from "./pdfSupport";

const setSearch = (search) => window.history.replaceState({}, "", `/${search}`);
afterEach(() => {
  setSearch("");
  vi.unstubAllGlobals();
});

describe("shouldUsePdfJs", () => {
  it("keeps the browser's own viewer on a desktop browser that has one", () => {
    vi.stubGlobal("navigator", { pdfViewerEnabled: true });
    window.matchMedia = vi.fn(() => ({ matches: false }));
    expect(shouldUsePdfJs()).toBe(false);
  });

  it("uses pdf.js when the browser can't display PDFs inline", () => {
    vi.stubGlobal("navigator", { pdfViewerEnabled: false });
    window.matchMedia = vi.fn(() => ({ matches: false }));
    expect(shouldUsePdfJs()).toBe(true);
  });

  it("uses pdf.js on touch devices even if they claim a viewer (iOS shows only page 1)", () => {
    vi.stubGlobal("navigator", { pdfViewerEnabled: true });
    window.matchMedia = vi.fn(() => ({ matches: true }));
    expect(shouldUsePdfJs()).toBe(true);
  });

  it("can be forced with ?viewer=pdfjs", () => {
    vi.stubGlobal("navigator", { pdfViewerEnabled: true });
    window.matchMedia = vi.fn(() => ({ matches: false }));
    setSearch("?viewer=pdfjs");
    expect(shouldUsePdfJs()).toBe(true);
  });
});
