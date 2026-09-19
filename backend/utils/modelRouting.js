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

// Deliberately the *default*, not an override: OPENAI_MODEL used to force every
// feature onto one model, but every documented deploy config (.env.example,
// render.yaml, docker-compose.yml) sets it to gpt-4o-mini — which silently
// switched this routing off everywhere it was meant to apply. Now
// OPENAI_MODEL only picks the model for features with no route below, and
// OPENAI_QUIZ_MODEL is the explicit knob for the routed one (set it to
// gpt-4o-mini to cap cost across the board, e.g. in local dev).
const DEFAULT_MODEL = "gpt-4o-mini";

export const modelForFeature = (feature) => {
  const explicitOverride = feature === "quiz" ? process.env.OPENAI_QUIZ_MODEL : undefined;
  return explicitOverride || FEATURE_MODELS[feature] || process.env.OPENAI_MODEL || DEFAULT_MODEL;
};
