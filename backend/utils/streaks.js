// "Streaks, daily goals, session summaries... cheap to build, and they're
// what make the demo feel like a product someone uses." Deliberately
// computed from ReviewLog timestamps rather than an incrementing counter
// field on the user — a counter can drift out of sync with reality (a
// missed decrement, a timezone bug); recomputing from the actual review
// history on every request can't drift, and a user's total review count
// makes this cheap enough to just recompute.

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// UTC calendar day, not the reviewer's local day — same simplification the
// rest of this app makes (no per-user timezone stored anywhere yet).
const toDayKey = (date) => new Date(date).toISOString().slice(0, 10);

/**
 * @param reviewedAtDates timestamps of every review, any order, duplicates
 *   within a day fine.
 * @param options.today reference date for "today" (defaults to now).
 * @returns `{ currentStreak, longestStreak, activeToday }` — `currentStreak`
 *   counts consecutive days ending *today or yesterday* (a streak isn't
 *   broken until a full day has passed with no review), 0 once broken.
 */
export const computeStreak = (reviewedAtDates, { today = new Date() } = {}) => {
  const days = [...new Set((reviewedAtDates || []).map(toDayKey))].sort();
  if (days.length === 0) return { currentStreak: 0, longestStreak: 0, activeToday: false };

  const dayNumbers = days.map((d) => Math.floor(new Date(`${d}T00:00:00.000Z`).getTime() / MS_PER_DAY));

  let longestStreak = 1;
  let run = 1;
  for (let i = 1; i < dayNumbers.length; i += 1) {
    run = dayNumbers[i] === dayNumbers[i - 1] + 1 ? run + 1 : 1;
    longestStreak = Math.max(longestStreak, run);
  }

  const todayNumber = Math.floor(new Date(toDayKey(today) + "T00:00:00.000Z").getTime() / MS_PER_DAY);
  const lastDayNumber = dayNumbers[dayNumbers.length - 1];
  const activeToday = lastDayNumber === todayNumber;

  // A gap of more than one day (today - lastReview > 1) breaks the streak
  // entirely; a gap of exactly one (reviewed yesterday, not yet today) keeps
  // it alive so a user checking in the morning doesn't see it reset before
  // they've had a chance to review today.
  if (todayNumber - lastDayNumber > 1) {
    return { currentStreak: 0, longestStreak, activeToday: false };
  }

  let currentStreak = 1;
  for (let i = dayNumbers.length - 1; i > 0; i -= 1) {
    if (dayNumbers[i] === dayNumbers[i - 1] + 1) currentStreak += 1;
    else break;
  }

  return { currentStreak, longestStreak, activeToday };
};
