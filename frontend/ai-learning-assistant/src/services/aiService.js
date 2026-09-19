import axiosInstance from "../utils/axiosInstance";
import { API_PATHS } from "../utils/apiPaths";

// One key per user action, generated when the request is *built*. axiosInstance
// re-sends the same config after a silent token refresh, so a retry carries the
// same key and the server replays the first result instead of paying for (and
// saving) a second generation.
export const newIdempotencyKey = () =>
  globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;

const idempotent = () => ({ headers: { "Idempotency-Key": newIdempotencyKey() } });

export const generateFlashcards = (documentId, count) =>
  axiosInstance.post(API_PATHS.AI.GENERATE_FLASHCARDS, { documentId, count }, idempotent());

export const generateQuiz = (documentId, numQuestions) =>
  axiosInstance.post(API_PATHS.AI.GENERATE_QUIZ, { documentId, numQuestions }, idempotent());

export const getSummary = (documentId) => axiosInstance.post(API_PATHS.AI.SUMMARY, { documentId });

export const explainConcept = (documentId, concept) =>
  axiosInstance.post(API_PATHS.AI.EXPLAIN, { documentId, concept });

export const sendChatMessage = (documentId, message) =>
  axiosInstance.post(API_PATHS.AI.CHAT, { documentId, message }, idempotent());

export const getChatHistory = (documentId) => axiosInstance.get(API_PATHS.AI.CHAT_HISTORY(documentId));
