// Vector search alone quietly fails on exact terms — "Theorem 4.2", a variable
// name, an author's surname — because an embedding of a rare token is mostly
// noise. BM25 is the other half of the hybrid retriever: a lexical scorer that
// nails exactly those, and misses the paraphrases the vectors catch.
//
// Implemented here rather than pulled in as a dependency because it is ~40
// lines, and because the index is per-document (hundreds of chunks, not
// millions) so an in-memory scan is the right shape.

const K1 = 1.5; // term-frequency saturation: how fast repeats stop helping
const B = 0.75; // length normalisation: how much a long chunk is penalised

// Keeps "4.2", "o(n)", and "state-of-the-art" as single terms, which is the
// entire reason BM25 is in the pipeline.
export const tokenize = (text) =>
  (text || "")
    .toLowerCase()
    .match(/[a-z0-9]+(?:[.'\-_][a-z0-9]+)*/g) || [];

/**
 * @param docs `[{ id, text }]`
 * @returns an index with `.search(query, limit)` → `[{ id, score }]`, best first.
 */
export const createBm25Index = (docs, { k1 = K1, b = B } = {}) => {
  const entries = (docs || []).map(({ id, text }) => {
    const terms = tokenize(text);
    const frequencies = new Map();
    for (const term of terms) frequencies.set(term, (frequencies.get(term) || 0) + 1);
    return { id, length: terms.length, frequencies };
  });

  const documentFrequency = new Map();
  for (const entry of entries) {
    for (const term of entry.frequencies.keys()) {
      documentFrequency.set(term, (documentFrequency.get(term) || 0) + 1);
    }
  }

  const total = entries.length;
  const averageLength = total ? entries.reduce((sum, e) => sum + e.length, 0) / total : 0;

  // The +0.5 smoothing keeps the IDF positive even for a term that appears in
  // every document, so a term can never *subtract* from a score.
  const idf = (term) => {
    const df = documentFrequency.get(term) || 0;
    return Math.log(1 + (total - df + 0.5) / (df + 0.5));
  };

  const search = (query, limit = 30) => {
    const queryTerms = [...new Set(tokenize(query))];
    if (queryTerms.length === 0 || total === 0) return [];

    const scored = entries.map((entry) => {
      let score = 0;
      for (const term of queryTerms) {
        const tf = entry.frequencies.get(term);
        if (!tf) continue;
        const normalisation = k1 * (1 - b + (b * entry.length) / (averageLength || 1));
        score += idf(term) * ((tf * (k1 + 1)) / (tf + normalisation));
      }
      return { id: entry.id, score };
    });

    return scored
      .filter((s) => s.score > 0)
      .sort((a, b2) => b2.score - a.score || String(a.id).localeCompare(String(b2.id)))
      .slice(0, limit);
  };

  return { search, size: total, averageLength };
};
