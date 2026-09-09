import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import RetentionForecastChart from "./RetentionForecastChart";
import { getForecast } from "../../services/reviewService";

vi.mock("../../services/reviewService", () => ({ getForecast: vi.fn() }));

const points = (avgRetention) => Array.from({ length: 91 }, (_, day) => ({ day, avgRetention }));

describe("RetentionForecastChart", () => {
  beforeEach(() => {
    getForecast.mockReset();
  });

  it("shows an empty-state message when the deck has never been reviewed", async () => {
    getForecast.mockResolvedValue({ data: { points: points(null) } });
    render(<RetentionForecastChart setId="set1" />);

    expect(await screen.findByText(/review a card in this deck/i)).toBeInTheDocument();
  });

  it("renders the chart heading once there's real forecast data", async () => {
    getForecast.mockResolvedValue({ data: { points: points(0.85) } });
    render(<RetentionForecastChart setId="set1" />);

    expect(await screen.findByText(/projected retention/i)).toBeInTheDocument();
  });

  it("requests the forecast for the given set id", async () => {
    getForecast.mockResolvedValue({ data: { points: points(0.9) } });
    render(<RetentionForecastChart setId="set-42" />);

    await screen.findByText(/projected retention/i);
    expect(getForecast).toHaveBeenCalledWith("set-42");
  });
});
