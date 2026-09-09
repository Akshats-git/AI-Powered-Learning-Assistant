import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import StreakBadge from "./StreakBadge";
import { getStreak } from "../../services/reviewService";

vi.mock("../../services/reviewService", () => ({ getStreak: vi.fn() }));

describe("StreakBadge", () => {
  beforeEach(() => {
    getStreak.mockReset();
  });

  it("renders nothing when there is no active streak", async () => {
    getStreak.mockResolvedValue({ data: { currentStreak: 0, longestStreak: 0, activeToday: false } });
    const { container } = render(<StreakBadge />);

    await vi.waitFor(() => expect(container.textContent).toBe(""));
  });

  it("shows the day count once there is an active streak", async () => {
    getStreak.mockResolvedValue({ data: { currentStreak: 5, longestStreak: 8, activeToday: true } });
    render(<StreakBadge />);

    expect(await screen.findByText(/5 days/)).toBeInTheDocument();
  });

  it("uses singular wording for a 1-day streak", async () => {
    getStreak.mockResolvedValue({ data: { currentStreak: 1, longestStreak: 1, activeToday: true } });
    render(<StreakBadge />);

    expect(await screen.findByText("1 day")).toBeInTheDocument();
  });

  it("degrades to nothing rather than an error if the request fails", async () => {
    getStreak.mockRejectedValue(new Error("network error"));
    const { container } = render(<StreakBadge />);

    await vi.waitFor(() => expect(container.textContent).toBe(""));
  });
});
