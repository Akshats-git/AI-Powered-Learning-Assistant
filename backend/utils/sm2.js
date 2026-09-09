// SM-2 (SuperMemo 2, Wozniak 1987) — the documented baseline the roadmap
// asks for before FSRS. Three pieces of state per card: `repetitions` (how
// many successful reviews in a row), `easeFactor` (how much the interval
// grows each time, starts at 2.5, floor 1.3), `intervalDays` (days until the
// next review).
//
// The original algorithm grades on 0-5; this app grades on the now-standard
// 4-button scale (Again/Hard/Good/Easy — same scale FSRS uses below), so
// grades are mapped onto SM-2's quality scale the way most modern SRS UIs
// built on top of SM-2 have historically done: Again=0 (fail, reset),
// Hard=3, Good=4, Easy=5. There's no "quality 1/2" button in this app's UI,
// so those values are simply never produced.

export const GRADE_TO_SM2_QUALITY = { again: 0, hard: 3, good: 4, easy: 5 };

const MIN_EASE_FACTOR = 1.3;
const DEFAULT_EASE_FACTOR = 2.5;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export const createInitialSm2State = () => ({ repetitions: 0, easeFactor: DEFAULT_EASE_FACTOR, intervalDays: 0 });

/**
 * @param state `{ repetitions, easeFactor, intervalDays }` — the card's state
 *   going into this review (createInitialSm2State() for a brand-new card).
 * @param grade one of "again" | "hard" | "good" | "easy".
 * @param reviewedAt when this review happened (defaults to now) — the next
 *   due date is computed from this, not from the previous due date, so a
 *   late review doesn't compound the delay forward.
 * @returns the updated `{ repetitions, easeFactor, intervalDays, dueDate }`.
 */
export const scheduleSm2 = (state, grade, reviewedAt = new Date()) => {
  const quality = GRADE_TO_SM2_QUALITY[grade];
  if (quality === undefined) throw new Error(`Unknown grade: ${grade}`);

  // The ease-factor update applies on every review, pass or fail — a card
  // that's been failed repeatedly should get harder (lower EF) even while
  // its interval keeps resetting to 1 day.
  const easeDelta = 0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02);
  const easeFactor = Math.max(MIN_EASE_FACTOR, state.easeFactor + easeDelta);

  let repetitions;
  let intervalDays;
  if (quality < 3) {
    // A lapse restarts the learning sequence — SM-2 doesn't try to be
    // clever about "partial credit" for a failed recall.
    repetitions = 0;
    intervalDays = 1;
  } else {
    repetitions = state.repetitions + 1;
    if (repetitions === 1) intervalDays = 1;
    else if (repetitions === 2) intervalDays = 6;
    else intervalDays = Math.round(state.intervalDays * easeFactor);
  }

  return {
    repetitions,
    easeFactor,
    intervalDays,
    dueDate: new Date(reviewedAt.getTime() + intervalDays * MS_PER_DAY),
  };
};
