// FSRS (Free Spaced Repetition Scheduler) — the algorithm SM-2 (utils/sm2.js)
// is the documented baseline for. Where SM-2 tracks one number (an ease
// factor) per card, FSRS tracks memory as two explicit quantities —
// stability (days until recall probability decays to ~90%) and difficulty
// (how hard this specific card is to remember, independent of how long it's
// been studied) — and derives the next interval from a target retention
// probability instead of a fixed multiplier. This is what makes an "89% of
// cards retained at day 30" chart possible later: retrievability is a real
// probability this module computes, not a proxy.
//
// The 17 weights below are FSRS-4.5's published default parameters (as
// distributed with the reference implementations, e.g. open-spaced-
// repetition/fsrs4anki and py-fsrs) — reconstructed here from documentation
// rather than copied from a live reference, since this environment has no
// network access to cross-check them against the canonical source. The
// formula *shapes* (initial stability/difficulty, the power-law forgetting
// curve, the stability-update equations) are standard FSRS and are what the
// tests below actually verify — every property test checks a *behavior*
// (successful recall increases stability, a lapse crashes it, difficulty
// stays in [1,10], harder retention targets mean shorter intervals) rather
// than an exact magic-number output, specifically because the 17 constants
// should be checked against the canonical reference implementation (or,
// properly, refit on this app's own ReviewLog data — see the roadmap's
// "replay 12k review logs" experiment) before being trusted for production
// scheduling decisions.

export const FSRS_DEFAULT_PARAMETERS = [
  0.4, 0.6, 2.4, 5.8, 4.93, 0.94, 0.86, 0.01, 1.49, 0.14, 0.94, 2.18, 0.05, 0.34, 1.26, 0.29, 2.61,
];

export const DEFAULT_REQUEST_RETENTION = 0.9;
const DECAY = -0.5;
const FACTOR = 19 / 81; // makes retrievability(t = stability) ≈ requestRetention (0.9)
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export const GRADE_TO_FSRS_RATING = { again: 1, hard: 2, good: 3, easy: 4 };

const clampDifficulty = (d) => Math.min(10, Math.max(1, d));

/**
 * Recall probability after `elapsedDays` since the last review, for a card
 * with the given `stability`. The defining property: `retrievability(S, S)`
 * is the request-retention target (~0.9) — stability is *defined* as "days
 * until recall probability drops to that target."
 */
export const retrievability = (elapsedDays, stability) => {
  if (stability <= 0) return 0;
  return Math.pow(1 + (FACTOR * Math.max(0, elapsedDays)) / stability, DECAY);
};

const initialStability = (rating, w) => w[rating - 1];

const initialDifficulty = (rating, w) => clampDifficulty(w[4] - (rating - 3) * w[5]);

// The difficulty a card would have if every review of it were rated Easy —
// used as the "reversion target" difficulty drifts back toward over time.
const easyDifficulty = (w) => clampDifficulty(w[4] - w[5]);

const nextDifficulty = (difficulty, rating, w) => {
  const delta = -w[6] * (rating - 3);
  const reverted = w[7] * easyDifficulty(w) + (1 - w[7]) * (difficulty + delta);
  return clampDifficulty(reverted);
};

const nextStabilityOnRecall = (stability, difficulty, r, rating, w) => {
  const hardPenalty = rating === 2 ? w[15] : 1;
  const easyBonus = rating === 4 ? w[16] : 1;
  const increase =
    Math.exp(w[8]) * (11 - difficulty) * Math.pow(stability, -w[9]) * (Math.exp(w[10] * (1 - r)) - 1) * hardPenalty * easyBonus + 1;
  return stability * increase;
};

const nextStabilityOnLapse = (stability, difficulty, r, w) =>
  w[11] * Math.pow(difficulty, -w[12]) * (Math.pow(stability + 1, w[13]) - 1) * Math.exp(w[14] * (1 - r));

/**
 * Days until retrievability decays to `requestRetention`, given `stability`
 * — the inverse of `retrievability()`, and what actually sets the next due
 * date. A higher `requestRetention` target (wanting to forget less) always
 * produces a *shorter* interval, and vice versa.
 */
export const nextIntervalDays = (stability, requestRetention = DEFAULT_REQUEST_RETENTION) =>
  (stability / FACTOR) * (Math.pow(requestRetention, 1 / DECAY) - 1);

export const createInitialFsrsState = () => ({ stability: null, difficulty: null, reps: 0, lapses: 0, lastReviewedAt: null });

/**
 * @param state `{ stability, difficulty, reps, lapses, lastReviewedAt }` —
 *   `createInitialFsrsState()` for a card that's never been reviewed.
 * @param grade one of "again" | "hard" | "good" | "easy".
 * @param reviewedAt when this review happened (defaults to now).
 * @param options.requestRetention target recall probability (0-1, default
 *   0.9) — the knob "how many reviews am I willing to do to retain this."
 * @param options.parameters override the default 17 FSRS weights (used by
 *   the scheduler comparison replay to test alternate parameter sets).
 * @returns the updated state plus `dueDate` and the `retrievability` at the
 *   moment of this review (null for a card's first-ever review, since
 *   there's no prior stability to compute it from).
 */
export const scheduleFsrs = (
  state,
  grade,
  reviewedAt = new Date(),
  { requestRetention = DEFAULT_REQUEST_RETENTION, parameters = FSRS_DEFAULT_PARAMETERS } = {}
) => {
  const rating = GRADE_TO_FSRS_RATING[grade];
  if (rating === undefined) throw new Error(`Unknown grade: ${grade}`);
  const w = parameters;

  const isFirstReview = state.stability === null || state.stability === undefined;
  const elapsedDays = isFirstReview || !state.lastReviewedAt ? 0 : (reviewedAt.getTime() - new Date(state.lastReviewedAt).getTime()) / MS_PER_DAY;
  const r = isFirstReview ? null : retrievability(elapsedDays, state.stability);

  let stability;
  let difficulty;
  if (isFirstReview) {
    stability = initialStability(rating, w);
    difficulty = initialDifficulty(rating, w);
  } else {
    difficulty = nextDifficulty(state.difficulty, rating, w);
    stability = rating === 1 ? nextStabilityOnLapse(state.stability, state.difficulty, r, w) : nextStabilityOnRecall(state.stability, state.difficulty, r, rating, w);
  }
  // Stability is a "days until ~90% recall" quantity — it's meaningless at
  // or below zero, and a pathological parameter combination could otherwise
  // produce one.
  stability = Math.max(0.1, stability);

  const intervalDays = Math.max(1, Math.round(nextIntervalDays(stability, requestRetention)));

  return {
    stability,
    difficulty,
    reps: state.reps + 1,
    lapses: state.lapses + (rating === 1 ? 1 : 0),
    lastReviewedAt: reviewedAt,
    dueDate: new Date(reviewedAt.getTime() + intervalDays * MS_PER_DAY),
    intervalDays,
    retrievabilityAtReview: r,
  };
};
