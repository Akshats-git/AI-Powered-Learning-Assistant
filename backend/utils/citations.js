import { pageForOffset } from "./pageMap.js";

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
// How far ahead of the first matching term the snippet starts, so the reader
// gets a little lead-in instead of a fragment that begins on the keyword.
const SNIPPET_LEAD_CHARS = 40;

const STOPWORDS = new Set(
  "the and for are was were with that this from what when where which who whom why how does did has have had can could would should about into over than then them they their there these those its not but you your our out all any".split(
    " "
  )
);

const queryTerms = (query) =>
  [...new Set((query || "").toLowerCase().match(/[a-z0-9]+/g) || [])].filter((w) => w.length > 2 && !STOPWORDS.has(w));

/**
 * Where inside `text` is the passage that best matches `query`? A chunk is ~700
 * tokens over up to several pages, so its first 220 characters are usually
 * not the sentence that actually supports the answer.
 *
 * @returns `{ snippet, matchOffset }` — `matchOffset` is where the best match
 *   sits in `text` (`null` when no query term appears), so the caller can work
 *   out which page that passage is really on.
 */
export const findBestSnippet = (text, query, length = SNIPPET_LENGTH) => {
  const head = () => ({
    snippet: text.length > length ? `${text.slice(0, length).trimEnd()}…` : text,
    matchOffset: null,
  });

  const terms = queryTerms(query);
  if (terms.length === 0) return head();

  const lower = text.toLowerCase();
  const hits = [];
  for (const term of terms) {
    let at = lower.indexOf(term);
    while (at !== -1) {
      hits.push({ pos: at, term });
      at = lower.indexOf(term, at + term.length);
    }
  }
  if (hits.length === 0) return head();
  hits.sort((a, b) => a.pos - b.pos);

  // Densest window: the start position covering the most *distinct* query terms.
  let best = { pos: hits[0].pos, distinct: 0 };
  for (let i = 0; i < hits.length; i += 1) {
    const inWindow = new Set();
    for (let j = i; j < hits.length && hits[j].pos < hits[i].pos + length - SNIPPET_LEAD_CHARS; j += 1) inWindow.add(hits[j].term);
    if (inWindow.size > best.distinct) best = { pos: hits[i].pos, distinct: inWindow.size };
  }

  let start = Math.max(0, best.pos - SNIPPET_LEAD_CHARS);
  if (start > 0) {
    // Snap forward to a word boundary so it doesn't open mid-word.
    const boundary = text.slice(start, best.pos).search(/\s/);
    if (boundary !== -1) start += boundary + 1;
  }
  const end = start + length;
  const body = text.slice(start, end).trim();

  return {
    snippet: `${start > 0 ? "…" : ""}${body}${end < text.length ? "…" : ""}`,
    matchOffset: best.pos,
  };
};

/**
 * The citation metadata sent back to the client — independent of whether the
 * model's prose actually mentioned a page number, since these are the chunks
 * that *were* retrieved and shown to it, not a parse of what it said.
 *
 * With `query` (the standalone question retrieval ran on) the snippet is the
 * best-matching passage in the chunk instead of its opening, and with the
 * document's `pageMap` plus the chunk's `charStart` that passage also gets an
 * exact `snippetPage` — a chunk's own `page`–`endPage` range can span several
 * pages. A `relevance` score from reranking, if the chunk has one, passes through.
 */
export const toSources = (chunks, { query = null, pageMap = null } = {}) =>
  (chunks || []).map((chunk) => {
    const { snippet, matchOffset } = query
      ? findBestSnippet(chunk.text, query)
      : { snippet: chunk.text.length > SNIPPET_LENGTH ? `${chunk.text.slice(0, SNIPPET_LENGTH).trimEnd()}…` : chunk.text, matchOffset: null };

    return {
      chunkId: chunk.id ?? null,
      page: chunk.page ?? null,
      endPage: chunk.endPage ?? null,
      sectionPath: chunk.sectionPath || [],
      snippet,
      ...(matchOffset !== null && pageMap?.length && Number.isFinite(chunk.charStart)
        ? { snippetPage: pageForOffset(pageMap, chunk.charStart + matchOffset) }
        : {}),
      ...(chunk.relevance != null ? { relevance: chunk.relevance } : {}),
    };
  });

// Reranking scores relevance 0–10. Retrieval hands the model up to six chunks,
// but the UI used to list all six as "sources" for an answer that only used
// one or two — most of them noise. Drop the ones the reranker itself scored as
// barely relevant; chunks with no score (rerank skipped because there were
// few candidates to begin with) are kept, and the best one is always kept.
export const MIN_SOURCE_RELEVANCE = 3;

export const filterRelevantSources = (sources) => {
  const kept = (sources || []).filter((s) => s.relevance == null || s.relevance >= MIN_SOURCE_RELEVANCE);
  return kept.length > 0 ? kept : (sources || []).slice(0, 1);
};
