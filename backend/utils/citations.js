// Retrieved chunks need to become two different things: the labeled text
// block the model actually reads, and the citation metadata the client gets
// back in the response. Kept separate from hybridRetrieval.js because this is
// presentation, not ranking — hybridRetrieval decides *which* chunks matter,
// this decides how they're shown.

const formatPageRange = (page, endPage) => {
  if (page == null) return null;
  return page === endPage || endPage == null ? `p. ${page}` : `p. ${page}–${endPage}`;
};

const formatLabel = (chunk, position) => {
  const parts = [`Excerpt ${position}`];
  const pageRange = formatPageRange(chunk.page, chunk.endPage);
  if (pageRange) parts.push(pageRange);
  if (chunk.sectionPath?.length) parts.push(chunk.sectionPath.join(" > "));
  return parts.join(" — ");
};

/**
 * The block of text the LLM is actually shown, in place of the raw
 * (truncated) document — each excerpt labeled with where it came from, so
 * the model can say "(p. 12)" instead of making up a location.
 */
export const buildRetrievedContext = (chunks) =>
  (chunks || []).map((chunk, i) => `[${formatLabel(chunk, i + 1)}]\n${chunk.text}`).join("\n\n");

const SNIPPET_LENGTH = 220;

/**
 * The citation metadata sent back to the client — independent of whether the
 * model's prose actually mentioned a page number, since these are the chunks
 * that *were* retrieved and shown to it, not a parse of what it said.
 */
export const toSources = (chunks) =>
  (chunks || []).map((chunk) => ({
    chunkId: chunk.id ?? null,
    page: chunk.page ?? null,
    endPage: chunk.endPage ?? null,
    sectionPath: chunk.sectionPath || [],
    snippet: chunk.text.length > SNIPPET_LENGTH ? `${chunk.text.slice(0, SNIPPET_LENGTH).trimEnd()}…` : chunk.text,
  }));
