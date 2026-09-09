import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect, vi, beforeEach } from "vitest";
import ReviewSessionPage from "./ReviewSessionPage";
import { getDueQueue } from "../../services/reviewService";
import { reviewCard } from "../../services/flashcardService";

vi.mock("../../services/reviewService", () => ({ getDueQueue: vi.fn() }));
vi.mock("../../services/flashcardService", () => ({ reviewCard: vi.fn() }));

const QUEUE = [
  { flashcardSetId: "set1", cardId: "card1", question: "Q1", answer: "A1", documentTitle: "Doc A", isNew: true },
  { flashcardSetId: "set2", cardId: "card2", question: "Q2", answer: "A2", documentTitle: "Doc B", isNew: false },
];

const renderPage = () =>
  render(
    <MemoryRouter>
      <ReviewSessionPage />
    </MemoryRouter>
  );

describe("ReviewSessionPage", () => {
  beforeEach(() => {
    getDueQueue.mockReset();
    reviewCard.mockReset();
    reviewCard.mockResolvedValue({ data: {} });
  });

  it("shows an empty state when nothing is due", async () => {
    getDueQueue.mockResolvedValue({ data: { items: [] } });
    renderPage();

    expect(await screen.findByText(/nothing due right now/i)).toBeInTheDocument();
  });

  it("walks through the queue, grading each card via reviewCard with its own set id", async () => {
    getDueQueue.mockResolvedValue({ data: { items: QUEUE } });
    renderPage();

    await screen.findByText("Q1");
    await userEvent.click(screen.getByText("Q1"));
    await userEvent.click(screen.getByRole("button", { name: /good/i }));

    expect(reviewCard).toHaveBeenCalledWith("set1", "card1", "good");
    await screen.findByText("Q2");
  });

  it("shows a session-complete summary after grading every card", async () => {
    getDueQueue.mockResolvedValue({ data: { items: QUEUE } });
    renderPage();

    await screen.findByText("Q1");
    await userEvent.click(screen.getByText("Q1"));
    await userEvent.click(screen.getByRole("button", { name: /good/i }));
    await screen.findByText("Q2");
    await userEvent.click(screen.getByText("Q2"));
    await userEvent.click(screen.getByRole("button", { name: /easy/i }));

    expect(await screen.findByText(/session complete/i)).toBeInTheDocument();
    expect(screen.getByText(/reviewed 2 cards/i)).toBeInTheDocument();
  });

  it("shows which document each card came from", async () => {
    getDueQueue.mockResolvedValue({ data: { items: QUEUE } });
    renderPage();

    await screen.findByText("Q1");
    expect(screen.getByText("Doc A")).toBeInTheDocument();
  });
});
