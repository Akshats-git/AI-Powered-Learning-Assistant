// Page numbers are the thing you can never recover after parsing: once a PDF
// is one flat string, there is no way to work out which page a sentence came
// from. So capture the boundaries at parse time and carry them on the
// document — every citation ("[p. 42]", and the click that jumps the viewer
// there) is downstream of this map existing.
//
// `pdf-parse` concatenates its per-page text with a "\n\n" joiner, so the
// offsets below describe the exact same string that lands in
// `Document.extractedText`.
const PAGE_JOINER_LENGTH = 2; // "\n\n"

/**
 * @param pages `[{ num, text }]` as returned by pdf-parse's `getText()`.
 * @returns `[{ page, start, end }]` — half-open character ranges into the
 *   concatenated document text.
 */
export const buildPageMap = (pages) => {
  let offset = 0;

  return (pages || []).map(({ num, text }) => {
    const start = offset;
    const end = start + (text || "").length;
    offset = end + PAGE_JOINER_LENGTH;
    return { page: num, start, end };
  });
};

/**
 * Which page does a character offset fall on? Binary search, because this
 * runs once per chunk over a map that can be 800 entries long.
 *
 * An offset landing in the joiner between two pages is attributed to the page
 * that just ended, not the one about to start — a chunk boundary sitting in
 * that gap belongs to the text before it.
 */
export const pageForOffset = (pageMap, offset) => {
  if (!pageMap || pageMap.length === 0) return null;
  if (offset < pageMap[0].start) return pageMap[0].page;

  let low = 0;
  let high = pageMap.length - 1;
  let candidate = pageMap[0];

  while (low <= high) {
    const mid = (low + high) >> 1;
    if (pageMap[mid].start <= offset) {
      candidate = pageMap[mid];
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  return candidate.page;
};
