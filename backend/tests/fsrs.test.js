import { describe, it, expect } from "vitest";
import {
  scheduleFsrs,
  createInitialFsrsState,
  retrievability,
  nextIntervalDays,
  GRADE_TO_FSRS_RATING,
  FSRS_DEFAULT_PARAMETERS,
} from "../utils/fsrs.js";

const DAY_MS = 24 * 60 * 60 * 1000;

describe("retrievability", () => {
  it("is 1 (perfect recall) at zero elapsed time", () => {
    expect(retrievability(0, 10)).toBeCloseTo(1, 10);
  });

  it("equals the ~0.9 request-retention target when elapsed time equals stability — the defining property of stability", () => {
    expect(retrievability(10, 10)).toBeCloseTo(0.9, 5);
    expect(retrievability(50, 50)).toBeCloseTo(0.9, 5);
  });

  it("decreases monotonically as elapsed time grows", () => {
    const samples = [0, 1, 5, 10, 30, 90].map((t) => retrievability(t, 20));
    for (let i = 1; i < samples.length; i += 1) expect(samples[i]).toBeLessThan(samples[i - 1]);
  });

  it("is higher for a more stable card at the same elapsed time", () => {
    expect(retrievability(10, 50)).toBeGreaterThan(retrievability(10, 5));
  });
});

describe("nextIntervalDays", () => {
  it("grows with stability", () => {
    expect(nextIntervalDays(50)).toBeGreaterThan(nextIntervalDays(5));
  });

  it("shrinks as the target retention gets stricter (wanting to forget less means reviewing sooner)", () => {
    expect(nextIntervalDays(20, 0.95)).toBeLessThan(nextIntervalDays(20, 0.8));
  });
});

describe("scheduleFsrs", () => {
  const now = new Date("2026-01-01T00:00:00Z");

  it("gives a brand-new card its initial stability/difficulty straight from the parameter table", () => {
    const state = scheduleFsrs(createInitialFsrsState(), "good", now);
    expect(state.stability).toBe(FSRS_DEFAULT_PARAMETERS[GRADE_TO_FSRS_RATING.good - 1]);
    expect(state.retrievabilityAtReview).toBeNull();
  });

  it("increases stability after a successful (Hard/Good/Easy) review", () => {
    let state = scheduleFsrs(createInitialFsrsState(), "good", now);
    const nextReview = new Date(state.dueDate);
    const before = state.stability;

    state = scheduleFsrs(state, "good", nextReview);
    expect(state.stability).toBeGreaterThan(before);
  });

  it("sharply reduces stability after a lapse (Again)", () => {
    let state = scheduleFsrs(createInitialFsrsState(), "good", now);
    state = scheduleFsrs(state, "good", new Date(state.dueDate));
    const beforeLapse = state.stability;

    state = scheduleFsrs(state, "again", new Date(state.dueDate));
    expect(state.stability).toBeLessThan(beforeLapse);
    expect(state.lapses).toBe(1);
  });

  it("keeps difficulty within the documented [1, 10] bounds across many reviews, including all-Again and all-Easy runs", () => {
    for (const grade of ["again", "easy"]) {
      let state = createInitialFsrsState();
      let reviewedAt = now;
      for (let i = 0; i < 30; i += 1) {
        state = scheduleFsrs(state, grade, reviewedAt);
        reviewedAt = new Date(state.dueDate);
        expect(state.difficulty).toBeGreaterThanOrEqual(1);
        expect(state.difficulty).toBeLessThanOrEqual(10);
      }
    }
  });

  it("orders next-interval length as Again < Hard < Good < Easy from the same starting state", () => {
    const seed = scheduleFsrs(createInitialFsrsState(), "good", now);
    const reviewedAt = new Date(seed.dueDate);

    const results = ["again", "hard", "good", "easy"].map((grade) => scheduleFsrs(seed, grade, reviewedAt).intervalDays);

    expect(results[0]).toBeLessThanOrEqual(results[1]);
    expect(results[1]).toBeLessThanOrEqual(results[2]);
    expect(results[2]).toBeLessThanOrEqual(results[3]);
    // And Easy should genuinely be longer than Again, not just tied.
    expect(results[3]).toBeGreaterThan(results[0]);
  });

  it("tracks reps and lapses across a review history", () => {
    let state = createInitialFsrsState();
    let reviewedAt = now;
    for (const grade of ["good", "again", "good", "again", "easy"]) {
      state = scheduleFsrs(state, grade, reviewedAt);
      reviewedAt = new Date(state.dueDate);
    }
    expect(state.reps).toBe(5);
    expect(state.lapses).toBe(2);
  });

  it("computes dueDate as reviewedAt plus intervalDays", () => {
    const state = scheduleFsrs(createInitialFsrsState(), "good", now);
    expect(state.dueDate.getTime() - now.getTime()).toBe(state.intervalDays * DAY_MS);
  });

  it("throws on an unrecognized grade rather than silently misgrading", () => {
    expect(() => scheduleFsrs(createInitialFsrsState(), "excellent")).toThrow(/unknown grade/i);
  });

  it("never lets stability collapse to zero or negative even under adversarial repeated lapses", () => {
    let state = scheduleFsrs(createInitialFsrsState(), "good", now);
    let reviewedAt = new Date(state.dueDate);
    for (let i = 0; i < 50; i += 1) {
      state = scheduleFsrs(state, "again", reviewedAt);
      reviewedAt = new Date(state.dueDate);
      expect(state.stability).toBeGreaterThan(0);
      expect(state.intervalDays).toBeGreaterThanOrEqual(1);
    }
  });

  it("accepts an alternate parameter set (for the SM-2/FSRS comparison replay)", () => {
    const altParams = FSRS_DEFAULT_PARAMETERS.map((v) => v * 1.1);
    const withDefaults = scheduleFsrs(createInitialFsrsState(), "good", now);
    const withAlt = scheduleFsrs(createInitialFsrsState(), "good", now, { parameters: altParams });

    expect(withAlt.stability).not.toBe(withDefaults.stability);
    expect(withAlt.stability).toBeCloseTo(FSRS_DEFAULT_PARAMETERS[2] * 1.1, 10);
  });
});
