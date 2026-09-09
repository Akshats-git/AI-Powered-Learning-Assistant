// Bayesian Knowledge Tracing: track P(knows this concept) per (user,
// concept) as evidence comes in from quiz answers. The textbook two-state
// HMM update (Corbett & Anderson, 1994) — a Bayesian revision of P(L) given
// whether this attempt was correct, then a forward step for the chance
// learning happened regardless of the answer's outcome.
//
// Four parameters, held at fixed literature-informed defaults rather than
// fitted per concept — fitting a 4-parameter HMM per concept needs enough
// attempts per concept to estimate it, which a personal study app doesn't
// have yet:
//
//   prior (P(L0)) — probability of already knowing it before any practice.
//   learn (P(T))  — probability of an unknown → known transition after one
//                   practice opportunity, whether or not that attempt itself
//                   was answered correctly.
//   slip  (P(S))  — probability of answering incorrectly despite knowing it.
//   guess (P(G))  — probability of answering correctly despite not knowing
//                   it. Every quiz question in this app is 4-option multiple
//                   choice (see utils/prompts.js's quizPrompt), so 0.25
//                   (chance level) is the principled default here, not a
//                   guess in the other sense of the word.

export const BKT_DEFAULT_PARAMETERS = { prior: 0.3, learn: 0.2, slip: 0.1, guess: 0.25 };

export const clampProbability = (p) => Math.min(1, Math.max(0, p));

/**
 * @param pKnownBefore current P(knows the concept), before this observation.
 * @param correct whether this attempt was answered correctly.
 * @param params override BKT_DEFAULT_PARAMETERS (e.g. for a differently-
 *   shaped question, where guess isn't 0.25).
 * @returns the updated P(knows the concept), after both the Bayesian
 *   revision and the forward learning step.
 */
export const updateMastery = (pKnownBefore, correct, params = BKT_DEFAULT_PARAMETERS) => {
  const { learn, slip, guess } = params;
  const pL = clampProbability(pKnownBefore);

  const numerator = correct ? pL * (1 - slip) : pL * slip;
  const denominator = correct ? pL * (1 - slip) + (1 - pL) * guess : pL * slip + (1 - pL) * (1 - guess);
  // A denominator of 0 only happens at a degenerate boundary (pL exactly 0
  // or 1 combined with a 0-probability guess/slip) — there's no informative
  // signal to revise on in that case, so leave P(L) where it was.
  const posterior = denominator === 0 ? pL : numerator / denominator;

  return clampProbability(posterior + (1 - posterior) * learn);
};

/** A concept is "mastered" once P(knows it) crosses this — the usual BKT convention. */
export const MASTERY_THRESHOLD = 0.95;

export const isMastered = (pKnown, threshold = MASTERY_THRESHOLD) => pKnown >= threshold;
