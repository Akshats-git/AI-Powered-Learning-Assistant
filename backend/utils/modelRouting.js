// "Model routing: cheap model for chat, stronger model for quiz generation,
// chosen per feature with the reasoning documented." The two features
// aren't equally hard: chat and flashcards work from excerpts the retrieval
// pipeline already narrowed down for them, and a wrong flashcard answer is
// cheap to notice and skip. A wrong quiz question is worse in a specific
// way — a plausible-sounding but ambiguous distractor, or two options that
// are both arguably correct, actively teaches something false and the
// grading logic (exact string match against `correctAnswer`) can't catch
// it. That's the one feature where the stronger, more expensive model
// earns its cost; everything else defaults to the cheap one.
export const FEATURE_MODELS = {
  quiz: "gpt-4o",
};

const DEFAULT_MODEL = "gpt-4o-mini";

/**
 * `OPENAI_MODEL`, if set, overrides routing entirely and forces every
 * feature onto one model — useful for local cost-capping or testing a
 * single model across the board without touching this file.
 */
export const modelForFeature = (feature) => process.env.OPENAI_MODEL || FEATURE_MODELS[feature] || DEFAULT_MODEL;
