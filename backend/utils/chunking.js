import { pageForOffset } from "./pageMap.js";

// `text.slice(0, 800)` cuts a definition in half and hands the retriever two
// chunks that each answer nothing. This splits on the document's own
// structure instead — headings first, then paragraphs, then sentences — and
// carries `{page, sectionPath, charRange}` on every chunk so an answer can
// cite where it came from.
//
// All offsets are into the original text, and chunks are always contiguous
// slices of it, so `text.slice(chunk.charStart, chunk.charEnd)` round-trips
// exactly. That is what lets a citation quote be located in the source later.

// ~4 characters per token is the usual rough estimate for English prose. It
// is deliberately not a real tokenizer: this only has to be consistent, not
// exact, and a tokenizer dependency on the ingest path is not worth it.
export const estimateTokens = (text) => Math.ceil((text || "").length / 4);

const HEADING_MAX_CHARS = 120;
const MARKDOWN_HEADING = /^(#{1,6})\s+(.+)$/;
const NUMBERED_HEADING = /^(\d+(?:\.\d+)*)[.)]?\s+(\S.*)$/;
const NAMED_SECTION = /^(chapter|section|appendix|part)\b/i;

/**
 * Split on blank lines, keeping each block's offsets into the original text.
 * `String.split` would be one line but throws the positions away, and the
 * positions are the whole point.
 */
export const splitBlocks = (text) => {
  const blocks = [];
  const source = text || "";
  const separator = /\n[ \t]*\n\s*/g;

  const push = (start, end) => {
    const raw = source.slice(start, end);
    const leading = raw.length - raw.trimStart().length;
    const trailing = raw.length - raw.trimEnd().length;
    if (raw.trim().length === 0) return;
    blocks.push({ text: raw.trim(), start: start + leading, end: end - trailing });
  };

  let cursor = 0;
  let match;
  while ((match = separator.exec(source)) !== null) {
    push(cursor, match.index);
    cursor = match.index + match[0].length;
  }
  push(cursor, source.length);

  return blocks;
};

/**
 * Heading detection is a heuristic on extracted PDF text, where the font-size
 * signal that made it a heading is already gone. Conservative on purpose: a
 * false positive fragments a section, and a missed heading only costs some
 * structure. Returns `null` for prose.
 */
export const detectHeading = (blockText) => {
  const line = (blockText || "").trim();
  if (!line || line.includes("\n") || line.length > HEADING_MAX_CHARS) return null;

  const markdown = line.match(MARKDOWN_HEADING);
  if (markdown) return { level: markdown[1].length, title: markdown[2].trim() };

  // Prose that happens to be short still ends like prose.
  if (/[.,;:]$/.test(line)) return null;

  const numbered = line.match(NUMBERED_HEADING);
  if (numbered) return { level: numbered[1].split(".").length, title: line };

  if (NAMED_SECTION.test(line)) return { level: 1, title: line };

  // ALL CAPS on its own line ("METHODS", "REFERENCES").
  if (/[A-Z]/.test(line) && line === line.toUpperCase() && !/[!?]$/.test(line)) {
    return { level: 1, title: line };
  }

  // A short Title Case line with no terminal punctuation.
  const words = line.split(/\s+/);
  const capitalized = words.filter((w) => /^[A-Z]/.test(w)).length;
  if (words.length <= 8 && !/[.!?]$/.test(line) && capitalized >= Math.ceil(words.length / 2)) {
    return { level: 1, title: line };
  }

  return null;
};

const SENTENCE_END = /(?<=[.!?])\s+(?=[A-Z0-9"'(\[])/g;

/**
 * A single paragraph can be longer than a whole chunk (PDF extraction happily
 * produces one 6,000-character run). Split it on sentence boundaries rather
 * than mid-word, keeping offsets.
 */
const splitOversizedBlock = (block, targetTokens) => {
  if (estimateTokens(block.text) <= targetTokens) return [block];

  const pieces = [];
  let pieceStart = 0;
  let match;
  SENTENCE_END.lastIndex = 0;

  const push = (start, end) => {
    const raw = block.text.slice(start, end);
    if (!raw.trim()) return;
    const leading = raw.length - raw.trimStart().length;
    const trailing = raw.length - raw.trimEnd().length;
    pieces.push({
      text: raw.trim(),
      start: block.start + start + leading,
      end: block.start + end - trailing,
    });
  };

  while ((match = SENTENCE_END.exec(block.text)) !== null) {
    const boundary = match.index + 1; // keep the terminal punctuation with the sentence
    if (estimateTokens(block.text.slice(pieceStart, boundary)) >= targetTokens) {
      push(pieceStart, boundary);
      pieceStart = boundary;
    }
  }
  push(pieceStart, block.text.length);

  // No sentence boundaries at all (a table, a reference list): fall back to a
  // hard character split so one pathological block can't become one huge chunk.
  if (pieces.length === 1 && estimateTokens(pieces[0].text) > targetTokens * 1.5) {
    const size = targetTokens * 4;
    const hard = [];
    for (let offset = 0; offset < block.text.length; offset += size) {
      const slice = block.text.slice(offset, offset + size);
      if (slice.trim()) hard.push({ text: slice.trim(), start: block.start + offset, end: block.start + offset + slice.length });
    }
    return hard;
  }

  return pieces;
};

/**
 * Where should the next chunk's overlap window begin? Walk back `maxChars`
 * from the end of the emitted chunk, then snap *forward* to the next sentence
 * boundary (or word boundary) so the overlap doesn't start mid-sentence.
 * Returns `null` when there is no room for an overlap that still advances.
 */
const findOverlapStart = (source, charStart, charEnd, maxChars) => {
  if (maxChars <= 0) return null;

  let start = Math.max(charStart, charEnd - maxChars);
  if (start <= charStart) return null;

  const window = source.slice(start, charEnd);
  const sentence = window.search(/(?<=[.!?])\s+/);
  if (sentence !== -1) {
    start += sentence + window.slice(sentence).match(/^\s*/)[0].length;
  } else {
    const space = window.search(/\s/);
    if (space !== -1) start += space + 1;
  }

  return start > charStart && start < charEnd ? start : null;
};

/**
 * @param text the full document text.
 * @param options.pageMap `[{page, start, end}]` from `buildPageMap`.
 * @returns `[{ index, text, page, endPage, sectionPath, charStart, charEnd, tokens }]`
 */
export const chunkText = (text, { targetTokens = 700, overlapRatio = 0.15, pageMap = [] } = {}) => {
  const source = text || "";
  if (!source.trim()) return [];

  const minTokens = Math.max(1, Math.floor(targetTokens * 0.4));
  const overlapTokens = Math.floor(targetTokens * overlapRatio);

  const units = [];
  for (const block of splitBlocks(source)) {
    const heading = detectHeading(block.text);
    if (heading) {
      units.push({ ...block, heading });
    } else {
      for (const piece of splitOversizedBlock(block, targetTokens)) units.push({ ...piece, heading: null });
    }
  }

  const chunks = [];
  const sectionStack = [];
  let current = [];
  let currentTokens = 0;

  const flush = (withOverlap) => {
    if (current.length === 0) return;

    const charStart = current[0].start;
    const charEnd = current[current.length - 1].end;
    const body = source.slice(charStart, charEnd);

    chunks.push({
      index: chunks.length,
      text: body,
      page: pageForOffset(pageMap, charStart),
      endPage: pageForOffset(pageMap, Math.max(charStart, charEnd - 1)),
      sectionPath: sectionStack.map((s) => s.title),
      charStart,
      charEnd,
      tokens: estimateTokens(body),
    });

    if (!withOverlap || overlapTokens <= 0) {
      current = [];
      currentTokens = 0;
      return;
    }

    // Carry the tail of this chunk into the next one so a fact split across
    // the boundary is still retrievable from at least one whole chunk. The
    // overlap is measured in characters rather than whole blocks: a single
    // block can be as large as the target, and seeding the next chunk with
    // one of those would double every chunk's size.
    const seedStart = findOverlapStart(source, charStart, charEnd, overlapTokens * 4);
    current = seedStart === null ? [] : [{ text: source.slice(seedStart, charEnd), start: seedStart, end: charEnd, heading: null }];
    currentTokens = current.reduce((sum, u) => sum + estimateTokens(u.text), 0);
  };

  for (const unit of units) {
    const tokens = estimateTokens(unit.text);

    if (unit.heading) {
      // A new section is a new context: start a fresh chunk rather than
      // dragging the previous section's tail across the boundary.
      if (currentTokens >= minTokens) flush(false);
      while (sectionStack.length && sectionStack[sectionStack.length - 1].level >= unit.heading.level) {
        sectionStack.pop();
      }
      sectionStack.push(unit.heading);
      current.push(unit);
      currentTokens += tokens;
      continue;
    }

    if (currentTokens + tokens > targetTokens && currentTokens >= minTokens) flush(true);

    current.push(unit);
    currentTokens += tokens;
  }

  flush(false);

  return chunks;
};
