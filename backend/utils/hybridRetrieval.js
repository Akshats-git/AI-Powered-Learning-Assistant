import { createBm25Index } from "./bm25.js";
import { rankByCosineSimilarity } from "./vectorSearch.js";
import { reciprocalRankFusion } from "./rrf.js";

// The pipeline from the roadmap, minus the network calls:
//
//   query ─┬─→ vector search (top 30) ─┐
//          └─→ BM25 search (top 30)  ──┴─→ RRF fuse → top `limit`
//
// Embedding the query itself is the caller's job (it needs `embeddings.js`,
// which talks to OpenAI) — this function takes the already-computed
// `queryEmbedding` so the actual fusion logic stays a pure function you can
// unit test with synthetic vectors instead of mocking an API. Reranking
// (cross-encoder over the fused top-30) is the next stage after this one and
// isn't done here.

export const VECTOR_TOP_K = 30;
export const LEXICAL_TOP_K = 30;
export const DEFAULT_RESULT_LIMIT = 6;

/**
 * @param query the user's question, for the lexical (BM25) side.
 * @param queryEmbedding the question's embedding vector, for the vector side.
 *   Pass `null` to skip vector search entirely (e.g. embeddings not
 *   generated yet for this document) and fall back to lexical-only.
 * @param chunks `[{ id, text, embedding }]` — a document's retrieval chunks.
 * @returns the fused top `limit` chunks, each with its fusion `score` and the
 *   1-based rank it held in each retriever (`null` if a retriever didn't
 *   return it at all) — the detail that makes a retrieved-context log
 *   explainable instead of just a black box.
 */
export const hybridSearch = ({
  query,
  queryEmbedding = null,
  chunks,
  limit = DEFAULT_RESULT_LIMIT,
  vectorTopK = VECTOR_TOP_K,
  lexicalTopK = LEXICAL_TOP_K,
}) => {
  if (!Array.isArray(chunks) || chunks.length === 0) return [];

  const byId = new Map(chunks.map((c) => [String(c.id), c]));

  const bm25 = createBm25Index(chunks.map((c) => ({ id: c.id, text: c.text })));
  const lexicalRanking = bm25.search(query, lexicalTopK).map((r) => r.id);

  const vectorRanking = queryEmbedding
    ? rankByCosineSimilarity(
        queryEmbedding,
        chunks.map((c) => ({ id: c.id, embedding: c.embedding })),
        vectorTopK
      ).map((r) => r.id)
    : [];

  const fused = reciprocalRankFusion([vectorRanking, lexicalRanking]);

  return fused.slice(0, limit).map((entry) => ({
    ...byId.get(String(entry.id)),
    score: entry.score,
    ranks: { vector: entry.ranks[0], lexical: entry.ranks[1] },
  }));
};
