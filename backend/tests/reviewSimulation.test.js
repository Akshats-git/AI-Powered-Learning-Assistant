import { describe, it, expect } from "vitest";
import { simulateCard, mulberry32, mean } from "../utils/reviewSimulation.js";
import { scheduleSm2, createInitialSm2State } from "../utils/sm2.js";
import { scheduleFsrs, createInitialFsrsState } from "../utils/fsrs.js";

const baseParams = { horizonDays: 365, maxReviews: 200, initialTrueStability: 3, seed: 7 };

describe("mulberry32", () => {
  it("is deterministic for a given seed", () => {
    const a = mulberry32(123);
    const b = mulberry32(123);
    expect(a()).toBe(b());
    expect(a()).toBe(b());
  });

  it("produces different sequences for different seeds", () => {
    const a = mulberry32(1)();
    const b = mulberry32(2)();
    expect(a).not.toBe(b);
  });

  it("stays within [0, 1)", () => {
    const rng = mulberry32(99);
    for (let i = 0; i < 1000; i += 1) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe("mean", () => {
  it("averages a list of numbers", () => {
    expect(mean([1, 2, 3])).toBe(2);
  });

  it("returns null for an empty list rather than NaN", () => {
    expect(mean([])).toBeNull();
  });
});

describe("simulateCard", () => {
  it("is reproducible for the same seed and scheduler", () => {
    const a = simulateCard({ scheduleFn: scheduleFsrs, initialState: createInitialFsrsState(), ...baseParams });
    const b = simulateCard({ scheduleFn: scheduleFsrs, initialState: createInitialFsrsState(), ...baseParams });
    expect(a).toEqual(b);
  });

  it("produces different results for different seeds", () => {
    const a = simulateCard({ scheduleFn: scheduleFsrs, initialState: createInitialFsrsState(), ...baseParams, seed: 1 });
    const b = simulateCard({ scheduleFn: scheduleFsrs, initialState: createInitialFsrsState(), ...baseParams, seed: 2 });
    expect(a).not.toEqual(b);
  });

  it("works with both the SM-2 and FSRS scheduler interfaces", () => {
    const sm2 = simulateCard({ scheduleFn: scheduleSm2, initialState: createInitialSm2State(), ...baseParams });
    const fsrs = simulateCard({ scheduleFn: scheduleFsrs, initialState: createInitialFsrsState(), ...baseParams });

    expect(sm2.reviews).toBeGreaterThan(0);
    expect(fsrs.reviews).toBeGreaterThan(0);
  });

  it("never exceeds maxReviews", () => {
    const result = simulateCard({
      scheduleFn: scheduleFsrs,
      initialState: createInitialFsrsState(),
      horizonDays: 100000,
      maxReviews: 10,
      initialTrueStability: 3,
      seed: 5,
    });
    expect(result.reviews).toBeLessThanOrEqual(10);
  });

  it("never runs past the horizon by more than one trailing review", () => {
    // The loop can start a review exactly at/before the horizon and then
    // step past it — it should never start a *second* one beyond that.
    const horizonDays = 30;
    const result = simulateCard({
      scheduleFn: scheduleSm2,
      initialState: createInitialSm2State(),
      horizonDays,
      maxReviews: 1000,
      initialTrueStability: 2,
      seed: 3,
    });
    // A card with initial interval 1 day reviewed daily in the worst case
    // still can't exceed horizonDays + 1 reviews.
    expect(result.reviews).toBeLessThanOrEqual(horizonDays + 1);
  });

  it("returns an average retention between 0 and 1", () => {
    const result = simulateCard({ scheduleFn: scheduleFsrs, initialState: createInitialFsrsState(), ...baseParams });
    expect(result.averageRetention).toBeGreaterThan(0);
    expect(result.averageRetention).toBeLessThanOrEqual(1);
  });

  it("does at least one review even for a very short horizon", () => {
    const result = simulateCard({
      scheduleFn: scheduleFsrs,
      initialState: createInitialFsrsState(),
      horizonDays: 0,
      maxReviews: 50,
      initialTrueStability: 3,
      seed: 1,
    });
    expect(result.reviews).toBe(1);
  });
});
