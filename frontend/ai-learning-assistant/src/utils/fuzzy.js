/**
 * Subsequence match score for command-palette filtering: every character of
 * `query` must appear in `text` in order ("dsh" matches "Dashboard"). Higher is
 * better — consecutive runs and word-start hits score more; -1 means no match.
 */
export const fuzzyScore = (query, text) => {
  const q = query.trim().toLowerCase();
  if (!q) return 0;
  const t = text.toLowerCase();

  let score = 0;
  let ti = 0;
  let streak = 0;
  for (const ch of q) {
    const at = t.indexOf(ch, ti);
    if (at === -1) return -1;
    streak = at === ti && ti > 0 ? streak + 1 : 0;
    score += 1 + streak * 2 + (at === 0 || /[\s\-_/]/.test(t[at - 1]) ? 3 : 0);
    ti = at + 1;
  }
  // Shorter targets beat longer ones for the same match ("Quizzes" over "Quiz results and history").
  return score - t.length * 0.01;
};

export const fuzzyFilter = (items, query, getText) =>
  items
    .map((item) => ({ item, score: fuzzyScore(query, getText(item)) }))
    .filter((r) => r.score >= 0)
    .sort((a, b) => b.score - a.score)
    .map((r) => r.item);
