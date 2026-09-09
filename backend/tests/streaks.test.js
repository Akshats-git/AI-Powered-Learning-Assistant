import { describe, it, expect } from "vitest";
import { computeStreak } from "../utils/streaks.js";

const d = (s) => new Date(`${s}T00:00:00.000Z`);

describe("computeStreak", () => {
  it("returns all zeros for no review history", () => {
    expect(computeStreak([])).toEqual({ currentStreak: 0, longestStreak: 0, activeToday: false });
  });

  it("counts a single day reviewed today as a streak of 1", () => {
    const today = d("2026-03-15");
    expect(computeStreak([d("2026-03-15")], { today })).toEqual({ currentStreak: 1, longestStreak: 1, activeToday: true });
  });

  it("counts consecutive days ending today", () => {
    const today = d("2026-03-15");
    const dates = [d("2026-03-13"), d("2026-03-14"), d("2026-03-15")];
    expect(computeStreak(dates, { today })).toMatchObject({ currentStreak: 3, activeToday: true });
  });

  it("keeps the streak alive the morning after (reviewed yesterday, not yet today)", () => {
    const dates = [d("2026-03-13"), d("2026-03-14")];
    const result = computeStreak(dates, { today: d("2026-03-15") });
    expect(result.currentStreak).toBe(2);
    expect(result.activeToday).toBe(false);
  });

  it("breaks the streak after a full missed day", () => {
    const dates = [d("2026-03-13"), d("2026-03-14")];
    const result = computeStreak(dates, { today: d("2026-03-16") });
    expect(result.currentStreak).toBe(0);
  });

  it("resets the current streak count after a gap, but keeps the true longest streak", () => {
    const dates = [d("2026-03-01"), d("2026-03-02"), d("2026-03-03"), d("2026-03-04"), d("2026-03-10")];
    const result = computeStreak(dates, { today: d("2026-03-10") });
    expect(result.currentStreak).toBe(1);
    expect(result.longestStreak).toBe(4);
  });

  it("counts multiple reviews on the same day as one streak day, not several", () => {
    const dates = [d("2026-03-15"), new Date("2026-03-15T18:00:00Z"), new Date("2026-03-15T23:00:00Z")];
    expect(computeStreak(dates, { today: d("2026-03-15") }).currentStreak).toBe(1);
  });

  it("is order-independent", () => {
    const inOrder = computeStreak([d("2026-03-13"), d("2026-03-14"), d("2026-03-15")], { today: d("2026-03-15") });
    const shuffled = computeStreak([d("2026-03-15"), d("2026-03-13"), d("2026-03-14")], { today: d("2026-03-15") });
    expect(shuffled).toEqual(inOrder);
  });
});
