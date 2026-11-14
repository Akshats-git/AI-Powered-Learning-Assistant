// Which PDF viewer to show. The browser's built-in one (in an <iframe>) is best where it
// exists: native zoom, search, print. But Android Chrome and most other mobile browsers
// have no inline viewer at all (a blank frame), and iOS shows only the first page, so on
// those — and wherever the browser says it can't display PDFs — we render with pdf.js.
// `?viewer=pdfjs` forces it (handy for testing, and as a manual escape hatch).
export const shouldUsePdfJs = () => {
  try {
    if (new URLSearchParams(window.location.search).get("viewer") === "pdfjs") return true;
    if (window.matchMedia?.("(pointer: coarse)")?.matches) return true;
    return navigator.pdfViewerEnabled === false;
  } catch {
    return false;
  }
};
