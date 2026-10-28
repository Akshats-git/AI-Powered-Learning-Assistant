import { useEffect } from "react";

const APP_NAME = "StudyAI";

/** Sets document.title to "<title> · StudyAI" while mounted (just "StudyAI" with no title). */
export const usePageTitle = (title) => {
  useEffect(() => {
    document.title = title ? `${title} · ${APP_NAME}` : APP_NAME;
  }, [title]);
};

// Static routes. Pages with a dynamic title (a document's name) call usePageTitle themselves.
export const ROUTE_TITLES = [
  [/^\/login$/, "Sign in"],
  [/^\/register$/, "Create account"],
  [/^\/forgot-password$/, "Reset password"],
  [/^\/reset-password$/, "Choose a new password"],
  [/^\/verify-email$/, "Verify email"],
  [/^\/dashboard$/, "Dashboard"],
  [/^\/documents$/, "Documents"],
  [/^\/documents\/[^/]+\/flashcards$/, "Flashcards"],
  [/^\/flashcards$/, "Flashcards"],
  [/^\/review$/, "Review"],
  [/^\/quizzes$/, "Quizzes"],
  [/^\/quizzes\/[^/]+\/results$/, "Quiz results"],
  [/^\/quizzes\/[^/]+$/, "Quiz"],
  [/^\/profile$/, "Profile"],
  [/^\/admin\/costs$/, "Cost dashboard"],
];

export const titleForPath = (pathname) => ROUTE_TITLES.find(([re]) => re.test(pathname))?.[1] ?? null;
