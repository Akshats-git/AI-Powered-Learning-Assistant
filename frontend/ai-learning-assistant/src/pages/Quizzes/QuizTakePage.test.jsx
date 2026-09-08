import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { describe, it, expect, vi, beforeEach } from "vitest";
import QuizTakePage from "./QuizTakePage";
import { getQuiz, submitQuiz } from "../../services/quizService";

vi.mock("../../services/quizService", () => ({
  getQuiz: vi.fn(),
  submitQuiz: vi.fn(),
}));

const navigateMock = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return { ...actual, useNavigate: () => navigateMock };
});

const QUIZ = {
  data: {
    _id: "quiz-1",
    title: "Sample quiz",
    questions: [
      { _id: "q1", question: "2 + 2 = ?", options: ["3", "4"] },
      { _id: "q2", question: "Capital of France?", options: ["Paris", "Rome"] },
    ],
  },
};

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={["/quizzes/quiz-1"]}>
      <Routes>
        <Route path="/quizzes/:id" element={<QuizTakePage />} />
      </Routes>
    </MemoryRouter>
  );

describe("QuizTakePage", () => {
  beforeEach(() => {
    navigateMock.mockClear();
    getQuiz.mockReset();
    submitQuiz.mockReset();
    getQuiz.mockResolvedValue(QUIZ);
    submitQuiz.mockResolvedValue({ data: {} });
  });

  it("submits answers as {questionId, answer} pairs, in question order, regardless of click order", async () => {
    renderPage();

    // Answer the second question's option before the first one to make sure
    // the submission is keyed by questionId, not by click/answer order.
    await screen.findByText("2 + 2 = ?");
    await userEvent.click(screen.getByRole("button", { name: "Next" }));
    await screen.findByText("Capital of France?");
    await userEvent.click(screen.getByRole("button", { name: "Paris" }));
    await userEvent.click(screen.getByRole("button", { name: "Previous" }));
    await screen.findByText("2 + 2 = ?");
    await userEvent.click(screen.getByRole("button", { name: "4" }));

    await userEvent.click(screen.getByRole("button", { name: /next/i }));
    await screen.findByText("Capital of France?");
    await userEvent.click(screen.getByRole("button", { name: /submit quiz/i }));

    await waitFor(() =>
      expect(submitQuiz).toHaveBeenCalledWith("quiz-1", [
        { questionId: "q1", answer: "4" },
        { questionId: "q2", answer: "Paris" },
      ])
    );
    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith("/quizzes/quiz-1/results"));
  });

  it("marks an unanswered question's answer as null instead of dropping it", async () => {
    renderPage();

    await screen.findByText("2 + 2 = ?");
    await userEvent.click(screen.getByRole("button", { name: "4" }));
    await userEvent.click(screen.getByRole("button", { name: /next/i }));

    // Leave the second question unanswered and submit anyway.
    await screen.findByText("Capital of France?");
    await userEvent.click(screen.getByRole("button", { name: /submit quiz/i }));
    await userEvent.click(await screen.findByRole("button", { name: /submit anyway/i }));

    await waitFor(() =>
      expect(submitQuiz).toHaveBeenCalledWith("quiz-1", [
        { questionId: "q1", answer: "4" },
        { questionId: "q2", answer: null },
      ])
    );
  });
});
