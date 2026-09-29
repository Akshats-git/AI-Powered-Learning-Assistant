// The provider node's catalog: learning resources, in Beckn's item shape.
//
// This is where the learning assistant meets the network. The app already
// generates summaries, flashcard decks and quizzes from an uploaded document
// and already tracks which concepts a learner is weak on (utils/bkt.js). Those
// artifacts are the catalog — each one tagged with the concept it teaches, so
// a consumer node searching "dijkstra" finds the deck that covers it.
//
// Beckn has no education domain schema for v2 yet (the DSEP adaptation is v1
// and unmaintained), so the concept/level/duration tags below are this
// implementation's own convention. See docs/beckn.md.

export const DOMAIN = "education";

const tag = (code, value) => ({ descriptor: { code }, value: String(value) });

export const buildItem = ({ id, name, shortDesc, kind, concepts, level = "beginner", durationMinutes, price = 0 }) => ({
  id,
  descriptor: { name, shortDesc },
  category: { id: kind },
  price: { currency: "INR", value: String(price) },
  tags: [
    tag("kind", kind),
    tag("level", level),
    tag("durationMinutes", durationMinutes),
    ...concepts.map((concept) => tag("concept", concept)),
  ],
});

export const DEFAULT_PROVIDER = {
  id: "learning-assistant",
  descriptor: {
    name: "AI Learning Assistant",
    shortDesc: "Flashcard decks, quizzes and micro-courses generated from source documents",
  },
};

export const DEFAULT_ITEMS = [
  buildItem({
    id: "deck-graphs-101",
    name: "Graph algorithms — flashcard deck",
    shortDesc: "48 cards on traversal, shortest paths and spanning trees, scheduled with FSRS",
    kind: "flashcard-deck",
    concepts: ["graphs", "dijkstra", "bfs", "dfs", "mst"],
    durationMinutes: 25,
  }),
  buildItem({
    id: "quiz-shortest-paths",
    name: "Shortest paths — practice quiz",
    shortDesc: "20 graded multiple-choice questions on Dijkstra, Bellman-Ford and A*",
    kind: "quiz",
    concepts: ["dijkstra", "bellman-ford", "shortest-paths"],
    level: "intermediate",
    durationMinutes: 30,
  }),
  buildItem({
    id: "course-dp-foundations",
    name: "Dynamic programming foundations",
    shortDesc: "A six-part micro-course from memoisation to tabulation, with worked examples",
    kind: "course",
    concepts: ["dynamic-programming", "memoisation", "recursion"],
    level: "intermediate",
    durationMinutes: 180,
    price: 499,
  }),
  buildItem({
    id: "course-linear-algebra",
    name: "Linear algebra for machine learning",
    shortDesc: "Vectors, matrices and eigendecomposition, aimed at ML practitioners",
    kind: "course",
    concepts: ["linear-algebra", "eigenvectors", "matrices"],
    durationMinutes: 240,
    price: 799,
  }),
];

const conceptsOf = (item) =>
  item.tags.filter((t) => t.descriptor.code === "concept").map((t) => t.value.toLowerCase());

/**
 * Matches a discovery intent against the catalog.
 *
 * A concept tag is an exact match — the consumer node got it from a mastery
 * model, not from a person typing, so fuzzy matching would only add noise.
 * Free text falls back to a substring match over the descriptor.
 */
export const matchItems = (items, intent = {}) => {
  const concepts = (intent.tags || [])
    .filter((t) => t.descriptor?.code === "concept")
    .map((t) => String(t.value).toLowerCase());
  const text = intent.item?.descriptor?.name?.toLowerCase().trim();

  if (!concepts.length && !text) return items;

  return items.filter((item) => {
    if (concepts.length && concepts.some((concept) => conceptsOf(item).includes(concept))) return true;
    if (text) {
      const haystack = `${item.descriptor.name} ${item.descriptor.shortDesc}`.toLowerCase();
      return haystack.includes(text);
    }
    return false;
  });
};
