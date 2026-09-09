import { describe, it, expect } from "vitest";
import { forecastRetention } from "../utils/retentionForecast.js";

const now = new Date("2026-03-15T00:00:00Z");

describe("forecastRetention", () => {
  it("starts near 1 at day 0 for a card reviewed just now", () => {
    const [day0] = forecastRetention([{ stability: 10, lastReviewedAt: now }], { days: 0, now });
    expect(day0.avgRetention).toBeGreaterThan(0.99);
  });

  it("decays monotonically as the projected day increases", () => {
    const points = forecastRetention([{ stability: 20, lastReviewedAt: now }], { days: 60, now });
    for (let i = 1; i < points.length; i += 1) {
      expect(points[i].avgRetention).toBeLessThanOrEqual(points[i - 1].avgRetention);
    }
  });

  it("decays faster for a lower-stability card than a higher-stability one", () => {
    const fragile = forecastRetention([{ stability: 3, lastReviewedAt: now }], { days: 30, now });
    const durable = forecastRetention([{ stability: 60, lastReviewedAt: now }], { days: 30, now });
    expect(fragile.at(-1).avgRetention).toBeLessThan(durable.at(-1).avgRetention);
  });

  it("averages across every schedulable card in the deck", () => {
    const points = forecastRetention(
      [
        { stability: 100, lastReviewedAt: now }, // barely decays
        { stability: 1, lastReviewedAt: now }, // decays fast
      ],
      { days: 10, now }
    );
    // The average should sit strictly between what either card alone would show.
    const soloHigh = forecastRetention([{ stability: 100, lastReviewedAt: now }], { days: 10, now });
    const soloLow = forecastRetention([{ stability: 1, lastReviewedAt: now }], { days: 10, now });
    expect(points[10].avgRetention).toBeGreaterThan(soloLow[10].avgRetention);
    expect(points[10].avgRetention).toBeLessThan(soloHigh[10].avgRetention);
  });

  it("excludes never-reviewed cards (no stability) from the average", () => {
    const withUnreviewed = forecastRetention(
      [{ stability: 10, lastReviewedAt: now }, { stability: null, lastReviewedAt: null }],
      { days: 5, now }
    );
    const withoutIt = forecastRetention([{ stability: 10, lastReviewedAt: now }], { days: 5, now });
    expect(withUnreviewed[5].avgRetention).toBeCloseTo(withoutIt[5].avgRetention, 10);
  });

  it("returns null averages (not zero, not NaN) for an all-unreviewed deck", () => {
    const points = forecastRetention([{ stability: null, lastReviewedAt: null }], { days: 3, now });
    expect(points.every((p) => p.avgRetention === null)).toBe(true);
  });

  it("returns days+1 points covering day 0 through day `days` inclusive", () => {
    const points = forecastRetention([{ stability: 10, lastReviewedAt: now }], { days: 90, now });
    expect(points).toHaveLength(91);
    expect(points[0].day).toBe(0);
    expect(points.at(-1).day).toBe(90);
  });

  it("accounts for time already elapsed since the last review, not just the projection window", () => {
    // Reviewed 20 days ago — day-0 retrievability should already reflect that gap.
    const stale = forecastRetention([{ stability: 10, lastReviewedAt: new Date(now.getTime() - 20 * 86400000) }], {
      days: 0,
      now,
    });
    const fresh = forecastRetention([{ stability: 10, lastReviewedAt: now }], { days: 0, now });
    expect(stale[0].avgRetention).toBeLessThan(fresh[0].avgRetention);
  });
});
