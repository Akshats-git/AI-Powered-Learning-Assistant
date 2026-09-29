// The provider node's catalog, in the v2 domain model.
//
// v2 does not have "items" and "orders". A Catalog holds Resources (the things
// on offer) and Offers (what they cost and how they are packaged), and domain
// detail lives in a JSON-LD `Attributes` object — `{ "@context", "@type", ... }`
// with anything else allowed — rather than in v1's tag arrays.
//
// That matters here because Beckn has no v2 domain schema for education or
// skilling. DSEP, the v1 adaptation, was last touched in July 2024; the domain
// repositories carrying v2 work cover agriculture, energy, mobility, tourism,
// retail, logistics, finance and health. So `@context` below points at a
// schema this app defines, which is exactly the extension point JSON-LD
// attributes exist for, and is the part most likely to change if an education
// domain schema is ever standardised.
//
// The resources themselves are what the learning assistant already generates:
// flashcard decks, quizzes and micro-courses derived from uploaded documents,
// each tagged with the concepts it teaches.

export const EDUCATION_CONTEXT = "https://ai-learning-assistant.example/schemas/education/v1";
export const EDUCATION_TYPE = "LearningResource";

export const buildResource = ({ id, name, shortDesc, kind, concepts, level = "beginner", durationMinutes }) => ({
  id,
  descriptor: { name, shortDesc },
  resourceAttributes: {
    "@context": EDUCATION_CONTEXT,
    "@type": EDUCATION_TYPE,
    kind,
    level,
    durationMinutes,
    concepts,
  },
});

export const buildOffer = ({ id, resourceIds, name, currency = "INR", value = 0 }) => ({
  id,
  descriptor: { name },
  resourceIds,
  considerations: [
    {
      id: `${id}-price`,
      considerationAttributes: {
        "@context": "https://schema.org",
        "@type": "PriceSpecification",
        priceCurrency: currency,
        price: String(value),
      },
    },
  ],
});

export const priceOf = (offer) => {
  const attributes = offer?.considerations?.[0]?.considerationAttributes;
  return { currency: attributes?.priceCurrency ?? "INR", value: Number(attributes?.price ?? 0) };
};

export const DEFAULT_PROVIDER = {
  id: "learning-assistant",
  descriptor: {
    name: "AI Learning Assistant",
    shortDesc: "Flashcard decks, quizzes and micro-courses generated from source documents",
  },
};

export const DEFAULT_RESOURCES = [
  buildResource({
    id: "deck-graphs-101",
    name: "Graph algorithms — flashcard deck",
    shortDesc: "48 cards on traversal, shortest paths and spanning trees, scheduled with FSRS",
    kind: "flashcard-deck",
    concepts: ["graphs", "dijkstra", "bfs", "dfs", "mst"],
    durationMinutes: 25,
  }),
  buildResource({
    id: "quiz-shortest-paths",
    name: "Shortest paths — practice quiz",
    shortDesc: "20 graded multiple-choice questions on Dijkstra, Bellman-Ford and A*",
    kind: "quiz",
    concepts: ["dijkstra", "bellman-ford", "shortest-paths"],
    level: "intermediate",
    durationMinutes: 30,
  }),
  buildResource({
    id: "course-dp-foundations",
    name: "Dynamic programming foundations",
    shortDesc: "A six-part micro-course from memoisation to tabulation, with worked examples",
    kind: "course",
    concepts: ["dynamic-programming", "memoisation", "recursion"],
    level: "intermediate",
    durationMinutes: 180,
  }),
  buildResource({
    id: "course-linear-algebra",
    name: "Linear algebra for machine learning",
    shortDesc: "Vectors, matrices and eigendecomposition, aimed at ML practitioners",
    kind: "course",
    concepts: ["linear-algebra", "eigenvectors", "matrices"],
    durationMinutes: 240,
  }),
];

export const DEFAULT_OFFERS = [
  buildOffer({ id: "offer-deck-graphs-101", resourceIds: ["deck-graphs-101"], name: "Free deck", value: 0 }),
  buildOffer({ id: "offer-quiz-shortest-paths", resourceIds: ["quiz-shortest-paths"], name: "Free quiz", value: 0 }),
  buildOffer({ id: "offer-course-dp-foundations", resourceIds: ["course-dp-foundations"], name: "Course enrolment", value: 499 }),
  buildOffer({ id: "offer-course-linear-algebra", resourceIds: ["course-linear-algebra"], name: "Course enrolment", value: 799 }),
];

// --- discovery ------------------------------------------------------------

// v2 replaced v1's tag-matching with two intent fields: `textSearch` for free
// text, and `filters.expression`, a JSONPath over the resource.
//
// A complete JSONPath engine is well beyond what this needs, so a deliberately
// small subset is evaluated: equality and membership against a dotted path,
//
//   $[?(@.resourceAttributes.level == 'intermediate')]
//   $[?('dijkstra' in @.resourceAttributes.concepts)]
//
// which covers every query the consumer node actually sends. Anything else is
// reported as unsupported rather than silently matching nothing — a filter
// that quietly returns an empty catalog is far worse to debug than one that
// says it was not understood.
const EQUALITY = /^\$\[\?\(@\.([\w.]+)\s*==\s*'([^']*)'\)\]$/;
const MEMBERSHIP = /^\$\[\?\('([^']*)'\s+in\s+@\.([\w.]+)\)\]$/;

const valueAt = (object, path) => path.split(".").reduce((node, key) => node?.[key], object);

export class UnsupportedFilterError extends Error {
  constructor(expression) {
    super(`unsupported filter expression: ${expression}`);
    this.name = "UnsupportedFilterError";
  }
}

export const matchesFilter = (resource, expression) => {
  const equality = expression.match(EQUALITY);
  if (equality) return String(valueAt(resource, equality[1])) === equality[2];

  const membership = expression.match(MEMBERSHIP);
  if (membership) {
    const collection = valueAt(resource, membership[2]);
    return Array.isArray(collection) && collection.includes(membership[1]);
  }
  throw new UnsupportedFilterError(expression);
};

export const matchResources = (resources, intent = {}) => {
  let matched = resources;

  if (intent.filters?.expression) {
    matched = matched.filter((resource) => matchesFilter(resource, intent.filters.expression));
  }

  if (intent.textSearch) {
    const needle = intent.textSearch.toLowerCase().trim();
    matched = matched.filter((resource) => {
      const haystack = `${resource.descriptor.name} ${resource.descriptor.shortDesc} ${resource.resourceAttributes.concepts.join(" ")}`;
      return haystack.toLowerCase().includes(needle);
    });
  }
  return matched;
};

/** A JSONPath filter selecting every resource that teaches `concept`. */
export const conceptFilter = (concept) => ({
  type: "jsonpath",
  expression: `$[?('${concept}' in @.resourceAttributes.concepts)]`,
});

/** Builds a spec-valid Catalog from whatever resources matched. */
export const buildCatalog = ({ id, provider, resources, offers }) => {
  const resourceIds = new Set(resources.map((resource) => resource.id));
  return {
    id,
    descriptor: provider.descriptor,
    provider,
    resources,
    offers: offers.filter((offer) => offer.resourceIds.some((rid) => resourceIds.has(rid))),
  };
};
