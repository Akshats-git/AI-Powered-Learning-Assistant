import { retrievability as fsrsRetrievability } from "./fsrs.js";

// The "replay logs against both schedulers" experiment the roadmap asks for
// needs real review history to replay — this app has none yet (a fresh
// project, not a production system with 12k logs). This module is the
// honest alternative: a synthetic learner simulation, so the comparison
// exists and is reproducible, with its methodology and limits disclosed
// rather than silently presented as if it were real usage data. Once
// ReviewLog rows exist for real, scripts/compareSchedulers.js should be
// pointed at them instead — this module's job stops at "simulate one card's
// review history under a given scheduler."
//
// **Disclosed limitation**: the synthetic learner's forgetting curve uses
// FSRS's own power-law retrievability formula as ground truth. That's a
// structural advantage for FSRS (a scheduler is easiest to evaluate well
// against the exact curve shape it assumes) and is not a claim that this
// simulation is an unbiased benchmark — it demonstrates the algorithms
// working correctly and gives a reproducible number, not a validated,
// bias-free comparison. A real comparison needs real user recall data.

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// mulberry32 — a small, seedable PRNG so a simulation run is reproducible
// (same seed → same synthetic learner → same outcome), without pulling in a
// dependency for something this small.
export const mulberry32 = (seed) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

export const mean = (values) => (values.length ? values.reduce((sum, v) => sum + v, 0) / values.length : null);

// A lapse crashes true stability to a fraction of its previous value; a
// successful recall strengthens it more the closer the review was to the
// card's actual forgetting point (the spacing effect FSRS/SM-2 both exist to
// exploit) — both with a little noise so not every card behaves identically.
const updateTrueStability = (trueStability, elapsedDays, success, rng) => {
  if (!success) return Math.max(0.5, trueStability * (0.3 + rng() * 0.15));
  const spacingBoost = 1 + Math.min(2.5, elapsedDays / Math.max(1, trueStability)) * (0.25 + rng() * 0.15);
  return trueStability * spacingBoost;
};

// Maps a binary recall outcome onto the 4-button grade scale both
// schedulers take — a real learner rarely reports a clean pass/fail, so a
// success is mostly "good" with some "easy", and a failure is always
// "again" (there's no partial credit for a genuine lapse in this app's UI).
const gradeFromOutcome = (success, rng) => {
  if (!success) return "again";
  if (rng() < 0.2) return "easy";
  if (rng() < 0.35) return "hard";
  return "good";
};

/**
 * Simulates one card's review history under `scheduleFn` (scheduleSm2 or
 * scheduleFsrs — anything taking `(state, grade, reviewedAt)` and returning
 * an object with `.intervalDays`) for up to `horizonDays`, capped at
 * `maxReviews` so a pathological parameter combination can't loop forever.
 *
 * @returns `{ reviews, averageRetention }` — total reviews performed, and
 *   the mean *true* retrievability at the moment of each review (the actual
 *   thing "did the scheduler keep this card well retained" measures).
 */
export const simulateCard = ({ scheduleFn, initialState, horizonDays, maxReviews, initialTrueStability, seed }) => {
  const rng = mulberry32(seed);
  let state = initialState;
  let trueStability = initialTrueStability;
  let currentDay = 0;
  let lastReviewDay = 0;
  let reviews = 0;
  const retentionAtReview = [];

  while (currentDay <= horizonDays && reviews < maxReviews) {
    const elapsedSinceLast = reviews === 0 ? 0 : currentDay - lastReviewDay;
    const r = reviews === 0 ? 1 : fsrsRetrievability(elapsedSinceLast, trueStability);
    const success = rng() < r;
    const grade = gradeFromOutcome(success, rng);

    const result = scheduleFn(state, grade, new Date(currentDay * MS_PER_DAY));

    if (reviews > 0) trueStability = updateTrueStability(trueStability, elapsedSinceLast, success, rng);
    retentionAtReview.push(r);

    reviews += 1;
    lastReviewDay = currentDay;
    state = result;
    currentDay += Math.max(1, result.intervalDays);
  }

  return { reviews, averageRetention: mean(retentionAtReview) };
};
