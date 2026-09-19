import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect, vi, beforeEach } from "vitest";
import WeakAreasPanel from "./WeakAreasPanel";
import { getMastery } from "../../services/masteryService";
import { generateFlashcards, generateQuiz } from "../../services/aiService";

const navigate = vi.fn();
vi.mock("react-router-dom", async (orig) => ({ ...(await orig()), useNavigate: () => navigate }));
vi.mock("react-hot-toast", () => ({ default: { success: vi.fn(), error: vi.fn() } }));
vi.mock("../../services/aiService", () => ({ generateFlashcards: vi.fn(), generateQuiz: vi.fn() }));

vi.mock("../../services/masteryService", () => ({ getMastery: vi.fn() }));

const renderPanel = () =>
  render(
    <MemoryRouter>
      <WeakAreasPanel />
    </MemoryRouter>
  );

describe("WeakAreasPanel", () => {
  beforeEach(() => {
    getMastery.mockReset();
    generateFlashcards.mockReset();
    generateQuiz.mockReset();
    navigate.mockReset();
  });

  it("renders nothing once loaded if there are no weak concepts yet", async () => {
    getMastery.mockResolvedValue({ data: { items: [], weakest: [] } });
    const { container } = renderPanel();

    await vi.waitFor(() => expect(container.querySelector(".animate-pulse")).not.toBeInTheDocument());
    expect(container.textContent).toBe("");
  });

  it("shows each weak concept with its mastery percentage and source document", async () => {
    getMastery.mockResolvedValue({
      data: {
        items: [],
        weakest: [
          { concept: "eigenvalues", documentId: "doc1", documentTitle: "Linear Algebra", pKnown: 0.22, opportunities: 3, mastered: false },
        ],
      },
    });
    renderPanel();

    expect(await screen.findByText("eigenvalues")).toBeInTheDocument();
    expect(screen.getByText("22%")).toBeInTheDocument();
    expect(screen.getByText("Linear Algebra")).toBeInTheDocument();
  });

  it("degrades to an empty (nothing shown) state rather than an error if the request fails", async () => {
    getMastery.mockRejectedValue(new Error("network error"));
    const { container } = renderPanel();

    await vi.waitFor(() => expect(container.querySelector(".animate-pulse")).not.toBeInTheDocument());
    expect(container.textContent).toBe("");
  });

  describe("targeted practice", () => {
    const weak = { concept: "eigenvalues", documentId: "doc1", documentTitle: "Linear Algebra", pKnown: 0.22, opportunities: 3, mastered: false };

    it("generates flashcards on just that concept, then opens the new set", async () => {
      getMastery.mockResolvedValue({ data: { items: [], weakest: [weak] } });
      generateFlashcards.mockResolvedValue({ data: { _id: "set9" } });
      renderPanel();

      await userEvent.click(await screen.findByRole("button", { name: /practice eigenvalues with flashcards/i }));

      expect(generateFlashcards).toHaveBeenCalledWith("doc1", 8, "eigenvalues");
      await vi.waitFor(() => expect(navigate).toHaveBeenCalledWith("/documents/doc1/flashcards?setId=set9"));
    });

    it("generates a quiz on just that concept, then opens it", async () => {
      getMastery.mockResolvedValue({ data: { items: [], weakest: [weak] } });
      generateQuiz.mockResolvedValue({ data: { _id: "quiz7" } });
      renderPanel();

      await userEvent.click(await screen.findByRole("button", { name: /practice eigenvalues with quiz/i }));

      expect(generateQuiz).toHaveBeenCalledWith("doc1", 5, "eigenvalues");
      await vi.waitFor(() => expect(navigate).toHaveBeenCalledWith("/quizzes/quiz7"));
    });

    it("disables every practice button while one is generating (no double spend), and stays put on failure", async () => {
      getMastery.mockResolvedValue({ data: { items: [], weakest: [weak, { ...weak, concept: "determinants" }] } });
      let fail;
      generateFlashcards.mockImplementation(() => new Promise((_, reject) => (fail = reject)));
      renderPanel();

      await userEvent.click(await screen.findByRole("button", { name: /practice eigenvalues with flashcards/i }));
      expect(screen.getByRole("button", { name: /practice determinants with quiz/i })).toBeDisabled();
      expect(screen.getByText("Generating...")).toBeInTheDocument();

      fail(new Error("nope"));
      await vi.waitFor(() => expect(screen.getByRole("button", { name: /practice determinants with quiz/i })).toBeEnabled());
      expect(navigate).not.toHaveBeenCalled();
    });
  });
});
