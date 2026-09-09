// The truncation-based prompts (prompts.js's `withTruncationNotice`) always
// took a document's first N characters — simple, but it means a 40-page
// paper's back half never existed as far as the model was concerned, and a
// question about page 300 fails silently. Once a document has been chunked
// (utils/chunking.js) and its chunks carry page numbers, there's a strictly
// better option that costs nothing extra: keep the same character budget,
// but *sample* chunks across the whole document instead of only reading the
// front of it.
//
// This isn't retrieval — there's no user question to retrieve against for
// flashcard/quiz/summary generation. Chat's hybridSearch answers "which
// chunks are relevant to this question"; this answers "which chunks best
// represent the whole document within a fixed budget."

export const DEFAULT_CONTEXT_CHARS = Number(process.env.MAX_DOCUMENT_CHARS) || 60000;

/**
 * `count` indices spread as evenly as possible across `[0, length - 1]`,
 * always including the first and last position — the introduction and the
 * conclusion are exactly the sections a coverage sample shouldn't skip —
 * de-duplicated and sorted, so a caller always walks the document in its
 * real order.
 */
const evenlySpacedIndices = (length, count) => {
  if (count >= length) return Array.from({ length }, (_, i) => i);
  if (count <= 1) return [0];

  const indices = new Set();
  for (let i = 0; i < count; i += 1) {
    indices.add(Math.round((i * (length - 1)) / (count - 1)));
  }
  return [...indices].sort((a, b) => a - b);
};

/**
 * @param chunks a document's chunks, in original document order.
 * @returns the subset of chunks to use as generation context, still in
 *   original document order. Returns every chunk unchanged when they already
 *   fit within `maxChars` — sampling only kicks in once truncation would
 *   otherwise be necessary.
 */
export const selectChunksForBudget = (chunks, { maxChars = DEFAULT_CONTEXT_CHARS } = {}) => {
  if (!Array.isArray(chunks) || chunks.length === 0) return [];

  const totalChars = chunks.reduce((sum, c) => sum + c.text.length, 0);
  if (totalChars <= maxChars) return chunks;

  const averageChars = totalChars / chunks.length;
  const targetCount = Math.max(1, Math.min(chunks.length, Math.floor(maxChars / averageChars)));

  const selected = [];
  let used = 0;
  for (const i of evenlySpacedIndices(chunks.length, targetCount)) {
    const chunk = chunks[i];
    if (used + chunk.text.length > maxChars && selected.length > 0) break;
    selected.push(chunk);
    used += chunk.text.length;
  }

  return selected;
};
