import { describe, it, expect } from "vitest";
import { scheduleSm2, createInitialSm2State, GRADE_TO_SM2_QUALITY } from "../utils/sm2.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const daysBetween = (a, b) => Math.round((b.getTime() - a.getTime()) / DAY_MS);

describe("scheduleSm2", () => {
  it("schedules the classic 1 day → 6 days → EF-scaled progression for consecutive good reviews", () => {
    const now = new Date("2026-01-01T00:00:00Z");
    let state = createInitialSm2State();

    state = scheduleSm2(state, "good", now);
    expect(state.intervalDays).toBe(1);
    expect(state.repetitions).toBe(1);

    state = scheduleSm2(state, "good", now);
    expect(state.intervalDays).toBe(6);
    expect(state.repetitions).toBe(2);

    const thirdIntervalBefore = state.intervalDays;
    const easeBefore = state.easeFactor;
    state = scheduleSm2(state, "good", now);
    expect(state.repetitions).toBe(3);
    expect(state.intervalDays).toBe(Math.round(thirdIntervalBefore * easeBefore));
    expect(state.intervalDays).toBeGreaterThan(6);
  });

  it("resets repetitions and the interval to 1 day on a lapse (Again)", () => {
    const now = new Date("2026-01-01T00:00:00Z");
    let state = createInitialSm2State();
    state = scheduleSm2(state, "good", now);
    state = scheduleSm2(state, "good", now);
    expect(state.repetitions).toBe(2);

    state = scheduleSm2(state, "again", now);
    expect(state.repetitions).toBe(0);
    expect(state.intervalDays).toBe(1);
  });

  it("still lowers the ease factor on a lapse even though the interval just resets", () => {
    const now = new Date("2026-01-01T00:00:00Z");
    const state = scheduleSm2(createInitialSm2State(), "again", now);
    expect(state.easeFactor).toBeLessThan(2.5);
  });

  it("never lets the ease factor drop below the 1.3 floor, even after repeated failures", () => {
    const now = new Date("2026-01-01T00:00:00Z");
    let state = createInitialSm2State();
    for (let i = 0; i < 20; i += 1) state = scheduleSm2(state, "again", now);
    expect(state.easeFactor).toBeGreaterThanOrEqual(1.3);
  });

  it("grows the ease factor (and so future intervals) for consistently easy reviews", () => {
    const now = new Date("2026-01-01T00:00:00Z");
    let state = createInitialSm2State();
    for (let i = 0; i < 5; i += 1) state = scheduleSm2(state, "easy", now);
    expect(state.easeFactor).toBeGreaterThan(2.5);
  });

  it("gives Easy a longer resulting interval than Good from the same starting state", () => {
    const now = new Date("2026-01-01T00:00:00Z");
    const base = { repetitions: 3, easeFactor: 2.5, intervalDays: 15 };

    const good = scheduleSm2(base, "good", now);
    const easy = scheduleSm2(base, "easy", now);
    expect(easy.intervalDays).toBeGreaterThan(good.intervalDays);
  });

  it("computes dueDate as reviewedAt plus the resulting interval, not from any prior due date", () => {
    const reviewedAt = new Date("2026-03-15T12:00:00Z");
    const state = scheduleSm2({ repetitions: 2, easeFactor: 2.5, intervalDays: 6 }, "good", reviewedAt);

    expect(daysBetween(reviewedAt, state.dueDate)).toBe(state.intervalDays);
  });

  it("throws on an unrecognized grade rather than silently misgrading", () => {
    expect(() => scheduleSm2(createInitialSm2State(), "excellent")).toThrow(/unknown grade/i);
  });

  it("maps the 4-button scale onto SM-2's 0-5 quality scale as documented", () => {
    expect(GRADE_TO_SM2_QUALITY).toEqual({ again: 0, hard: 3, good: 4, easy: 5 });
  });
});
