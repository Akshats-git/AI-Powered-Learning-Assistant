import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import FlashcardViewer from "./FlashcardViewer";

const CARDS = [
  { _id: "c1", question: "Q1", answer: "A1", difficulty: "easy", isFavorite: false },
  { _id: "c2", question: "Q2", answer: "A2", difficulty: "medium", isFavorite: false },
];

describe("FlashcardViewer", () => {
  let onReview;
  let onToggleFavorite;

  beforeEach(() => {
    onReview = vi.fn();
    onToggleFavorite = vi.fn();
  });

  it("shows the question first, flips to the answer on click, without reviewing yet", async () => {
    render(<FlashcardViewer cards={CARDS} onReview={onReview} onToggleFavorite={onToggleFavorite} />);

    expect(screen.getByText("Q1")).toBeInTheDocument();
    await userEvent.click(screen.getByText("Q1"));

    expect(screen.getByText("A1")).toBeInTheDocument();
    expect(onReview).not.toHaveBeenCalled();
  });

  it("shows the 4 grade buttons only once flipped", async () => {
    render(<FlashcardViewer cards={CARDS} onReview={onReview} onToggleFavorite={onToggleFavorite} />);

    expect(screen.queryByRole("button", { name: /good/i })).not.toBeInTheDocument();
    await userEvent.click(screen.getByText("Q1"));
    expect(screen.getByRole("button", { name: /good/i })).toBeInTheDocument();
  });

  it("grades the card and advances to the next one on a grade click", async () => {
    render(<FlashcardViewer cards={CARDS} onReview={onReview} onToggleFavorite={onToggleFavorite} />);

    await userEvent.click(screen.getByText("Q1"));
    await userEvent.click(screen.getByRole("button", { name: /good/i }));

    expect(onReview).toHaveBeenCalledWith("c1", "good");
    expect(screen.getByText("Q2")).toBeInTheDocument();
  });

  it("grades via the 1-4 number keys once flipped", async () => {
    render(<FlashcardViewer cards={CARDS} onReview={onReview} onToggleFavorite={onToggleFavorite} />);

    await userEvent.click(screen.getByText("Q1"));
    await userEvent.keyboard("4");

    expect(onReview).toHaveBeenCalledWith("c1", "easy");
  });

  it("ignores the 1-4 keys before the card is flipped", async () => {
    render(<FlashcardViewer cards={CARDS} onReview={onReview} onToggleFavorite={onToggleFavorite} />);

    await userEvent.keyboard("3");
    expect(onReview).not.toHaveBeenCalled();
  });

  it("flips on the space key", async () => {
    render(<FlashcardViewer cards={CARDS} onReview={onReview} onToggleFavorite={onToggleFavorite} />);

    await userEvent.keyboard(" ");
    expect(screen.getByText("A1")).toBeInTheDocument();
  });

  it("toggles favorite independently of flip/grade state", async () => {
    render(<FlashcardViewer cards={CARDS} onReview={onReview} onToggleFavorite={onToggleFavorite} />);

    await userEvent.click(screen.getByLabelText(/toggle favorite/i));
    expect(onToggleFavorite).toHaveBeenCalledWith("c1");
    expect(onReview).not.toHaveBeenCalled();
  });
});
