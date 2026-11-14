import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect, vi } from "vitest";
import DueTodayCard from "./DueTodayCard";
import { getDueQueue } from "../../services/reviewService";

vi.mock("../../services/reviewService", () => ({ getDueQueue: vi.fn() }));

const renderIt = () => render(<MemoryRouter><DueTodayCard /></MemoryRouter>);

describe("DueTodayCard", () => {
  it("links to the review session with the due count", async () => {
    getDueQueue.mockResolvedValue({ data: { items: [], total: 12 } });
    renderIt();
    const link = await screen.findByRole("link", { name: /12 cards due for review/i });
    expect(link).toHaveAttribute("href", "/review");
  });

  it("uses the singular for one card", async () => {
    getDueQueue.mockResolvedValue({ data: { items: [], total: 1 } });
    renderIt();
    expect(await screen.findByText("1 card due for review")).toBeInTheDocument();
  });

  it("renders nothing when nothing is due, or the request fails", async () => {
    getDueQueue.mockResolvedValue({ data: { items: [], total: 0 } });
    const { container, rerender } = renderIt();
    await Promise.resolve();
    expect(container).toBeEmptyDOMElement();

    getDueQueue.mockRejectedValue(new Error("x"));
    rerender(<MemoryRouter key="2"><DueTodayCard /></MemoryRouter>);
    await Promise.resolve();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});
