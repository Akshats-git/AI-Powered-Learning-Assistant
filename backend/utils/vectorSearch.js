// The vector half of hybrid retrieval. Deliberately just cosine similarity
// over an in-memory array: a document's chunk count is in the hundreds, not
// millions, so a brute-force scan is both simpler and fast enough, and it
// keeps this module network-free and unit-testable — same shape as
// `createBm25Index` in bm25.js, so the two compose directly through RRF.
//
// This is *not* MongoDB Atlas Vector Search (`$vectorSearch`) — that needs an
// Atlas-hosted cluster with a vector index provisioned, which is an infra
// decision (Phase 25/26), not a code one. This module is the interim
// implementation and the interface `hybridRetrieval.js` depends on, so
// swapping in `$vectorSearch` later only changes how the ranked list of ids
// is produced, not anything downstream of it.

/**
 * @param a, b equal-length embedding vectors.
 */
export const cosineSimilarity = (a, b) => {
  if (!a || !b || a.length !== b.length || a.length === 0) return 0;

  let dot = 0;
  let magnitudeA = 0;
  let magnitudeB = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    magnitudeA += a[i] * a[i];
    magnitudeB += b[i] * b[i];
  }

  if (magnitudeA === 0 || magnitudeB === 0) return 0;
  return dot / (Math.sqrt(magnitudeA) * Math.sqrt(magnitudeB));
};

/**
 * @param queryEmbedding the query's embedding vector.
 * @param items `[{ id, embedding }]`.
 * @returns `[{ id, score }]`, best (most similar) first — same shape as
 *   `bm25Index.search()`, so both feed straight into `reciprocalRankFusion`.
 */
export const rankByCosineSimilarity = (queryEmbedding, items, limit = 30) => {
  if (!queryEmbedding || !Array.isArray(items) || items.length === 0) return [];

  return items
    .map(({ id, embedding }) => ({ id, score: cosineSimilarity(queryEmbedding, embedding) }))
    .filter((entry) => Number.isFinite(entry.score) && entry.score > 0)
    .sort((x, y) => y.score - x.score || String(x.id).localeCompare(String(y.id)))
    .slice(0, limit);
};
