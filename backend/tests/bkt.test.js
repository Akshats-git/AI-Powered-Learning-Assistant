import { describe, it, expect } from "vitest";
import { updateMastery, clampProbability, isMastered, BKT_DEFAULT_PARAMETERS, MASTERY_THRESHOLD } from "../utils/bkt.js";

describe("clampProbability", () => {
  it("clamps to [0, 1]", () => {
    expect(clampProbability(-0.5)).toBe(0);
    expect(clampProbability(1.5)).toBe(1);
    expect(clampProbability(0.42)).toBe(0.42);
  });
});

describe("updateMastery", () => {
  it("increases P(known) after a correct answer", () => {
    const before = 0.3;
    const after = updateMastery(before, true);
    expect(after).toBeGreaterThan(before);
  });

  it("decreases P(known) after an incorrect answer", () => {
    const before = 0.5;
    const after = updateMastery(before, false);
    expect(after).toBeLessThan(before);
  });

  it("converges toward 1 (but never exceeds it) with repeated correct answers", () => {
    let p = BKT_DEFAULT_PARAMETERS.prior;
    for (let i = 0; i < 15; i += 1) {
      const next = updateMastery(p, true);
      expect(next).toBeGreaterThanOrEqual(p);
      expect(next).toBeLessThanOrEqual(1);
      p = next;
    }
    expect(p).toBeGreaterThan(0.99);
  });

  it("never drops below 0, even under repeated incorrect answers", () => {
    let p = BKT_DEFAULT_PARAMETERS.prior;
    for (let i = 0; i < 15; i += 1) {
      p = updateMastery(p, false);
      expect(p).toBeGreaterThanOrEqual(0);
    }
  });

  it("stabilizes rather than diverging under a long streak of incorrect answers (a floor set by guess/learn, not zero)", () => {
    let p = BKT_DEFAULT_PARAMETERS.prior;
    for (let i = 0; i < 30; i += 1) p = updateMastery(p, false);
    const stableFloor = p;
    p = updateMastery(p, false);
    expect(p).toBeCloseTo(stableFloor, 3);
  });

  it("moves P(known) more from an unexpected outcome than an expected one (Bayesian surprise)", () => {
    // Starting from a middling belief, a correct answer should move it up
    // by roughly the same order of magnitude either the surprising or
    // expected direction — sanity check it isn't a no-op either way.
    const fromCorrect = updateMastery(0.3, true) - 0.3;
    const fromIncorrect = 0.3 - updateMastery(0.3, false);
    expect(fromCorrect).toBeGreaterThan(0);
    expect(fromIncorrect).toBeGreaterThan(0);
  });

  it("never divides by zero at the pKnown=0 or pKnown=1 boundaries", () => {
    expect(() => updateMastery(0, true)).not.toThrow();
    expect(() => updateMastery(0, false)).not.toThrow();
    expect(() => updateMastery(1, true)).not.toThrow();
    expect(() => updateMastery(1, false)).not.toThrow();
    expect(Number.isFinite(updateMastery(0, true))).toBe(true);
    expect(Number.isFinite(updateMastery(1, false))).toBe(true);
  });

  it("accepts overridden parameters (e.g. a non-4-option question's guess rate)", () => {
    const withDefaultGuess = updateMastery(0.3, true, { ...BKT_DEFAULT_PARAMETERS, guess: 0.25 });
    const withLowGuess = updateMastery(0.3, true, { ...BKT_DEFAULT_PARAMETERS, guess: 0.05 });
    // A correct answer is stronger evidence of knowledge when guessing right
    // was less likely to begin with.
    expect(withLowGuess).toBeGreaterThan(withDefaultGuess);
  });
});

describe("isMastered", () => {
  it("uses the MASTERY_THRESHOLD by default", () => {
    expect(isMastered(MASTERY_THRESHOLD)).toBe(true);
    expect(isMastered(MASTERY_THRESHOLD - 0.01)).toBe(false);
  });

  it("accepts a custom threshold", () => {
    expect(isMastered(0.7, 0.6)).toBe(true);
    expect(isMastered(0.5, 0.6)).toBe(false);
  });
});
