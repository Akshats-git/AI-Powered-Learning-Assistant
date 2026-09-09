// Reciprocal Rank Fusion: how the vector ranking and the BM25 ranking become
// one ranking. It fuses on *rank position* rather than score, which is what
// makes it work at all here — a cosine similarity of 0.83 and a BM25 score of
// 11.4 are not comparable numbers, and any attempt to normalise them into the
// same range needs tuning that would go stale the moment the model changes.
//
// score(d) = Σ  weight_i / (k + rank_i(d))
//
// `k` (60 is the value from the original paper) damps the top of each list so
// one retriever's #1 can't dominate a document that both retrievers ranked
// highly but not first — agreement beats a single strong opinion.

export const RRF_K = 60;

/**
 * @param rankings an array of ranked id lists, best first, one per retriever.
 * @param options.weights per-ranking weight, defaulting to 1 for each.
 * @returns `[{ id, score, ranks }]` sorted best first; `ranks` is the 1-based
 *   position this id held in each input list (`null` where it was absent),
 *   which is what makes a fused result explainable in a log or a debug view.
 */
export const reciprocalRankFusion = (rankings, { k = RRF_K, weights = [] } = {}) => {
  const lists = (rankings || []).filter(Array.isArray);
  const fused = new Map();

  lists.forEach((ids, listIndex) => {
    const weight = weights[listIndex] ?? 1;

    ids.forEach((id, position) => {
      const key = String(id);
      if (!fused.has(key)) {
        fused.set(key, { id, score: 0, ranks: lists.map(() => null) });
      }
      const entry = fused.get(key);
      // A duplicate id inside one list keeps its best (first) position.
      if (entry.ranks[listIndex] !== null) return;
      entry.ranks[listIndex] = position + 1;
      entry.score += weight / (k + position + 1);
    });
  });

  return [...fused.values()].sort((a, b) => b.score - a.score || String(a.id).localeCompare(String(b.id)));
};
