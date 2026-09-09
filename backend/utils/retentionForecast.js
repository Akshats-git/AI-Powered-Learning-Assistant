import { retrievability } from "./fsrs.js";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// "Chart projected recall over the next 90 days per deck... falls straight
// out of FSRS" — literally true: retrievability(t, stability) is already a
// probability, so projecting it forward is just evaluating the same
// function at future days. This projects the *if you stop reviewing from
// today* curve (no further reviews assumed) — the standard, and more
// informative, framing for a retention forecast: "assuming you keep to
// schedule" would just hover near the request-retention target by
// definition and isn't an interesting chart.
//
// A card with no `stability` yet (never reviewed) is excluded from the
// average at every checkpoint rather than treated as having any particular
// retrievability — there's no scheduling model for a card that hasn't been
// through FSRS at all yet.

/**
 * @param cards `[{ stability, lastReviewedAt }]` — a deck's cards' FSRS state.
 * @param options.days how far out to project (default 90).
 * @param options.now reference date for "today" (defaults to now).
 * @returns `[{ day, avgRetention }]` for day 0..days, `avgRetention` null on
 *   a day with no schedulable cards at all.
 */
export const forecastRetention = (cards, { days = 90, now = new Date() } = {}) => {
  const schedulable = (cards || []).filter((c) => c.stability != null && c.lastReviewedAt);

  const points = [];
  for (let day = 0; day <= days; day += 1) {
    if (schedulable.length === 0) {
      points.push({ day, avgRetention: null });
      continue;
    }

    const retentions = schedulable.map((card) => {
      const daysSinceLastReview = (now.getTime() - new Date(card.lastReviewedAt).getTime()) / MS_PER_DAY;
      return retrievability(daysSinceLastReview + day, card.stability);
    });
    points.push({ day, avgRetention: retentions.reduce((sum, r) => sum + r, 0) / retentions.length });
  }

  return points;
};
