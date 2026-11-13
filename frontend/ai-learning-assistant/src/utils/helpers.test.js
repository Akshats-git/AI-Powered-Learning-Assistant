import { describe, it, expect } from "vitest";
import { timeAgo, formatFileSize } from "./helpers";

const NOW = new Date("2026-11-13T12:00:00Z").getTime();
const ago = (seconds) => new Date(NOW - seconds * 1000).toISOString();

describe("timeAgo", () => {
  it.each([
    [5, "just now"],
    [120, "2 minutes ago"],
    [3 * 3600, "3 hours ago"],
    [24 * 3600, "yesterday"],
    [3 * 24 * 3600, "3 days ago"],
    [14 * 24 * 3600, "2 weeks ago"],
    [70 * 24 * 3600, "2 months ago"],
    [800 * 24 * 3600, "2 years ago"],
  ])("%is ago reads as %s", (seconds, expected) => {
    expect(timeAgo(ago(seconds), NOW)).toBe(expected);
  });

  it("returns an empty string for an invalid date instead of 'NaN'", () => {
    expect(timeAgo("not a date", NOW)).toBe("");
  });
});

describe("formatFileSize", () => {
  it("never shows 0 KB", () => expect(formatFileSize(10)).toBe("1 KB"));
});
