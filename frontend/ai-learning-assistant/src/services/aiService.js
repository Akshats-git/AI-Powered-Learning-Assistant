import axiosInstance from "../utils/axiosInstance";
import { API_PATHS } from "../utils/apiPaths";

export const generateFlashcards = (documentId, count) =>
  axiosInstance.post(API_PATHS.AI.GENERATE_FLASHCARDS, { documentId, count });

export const generateQuiz = (documentId, numQuestions) =>
  axiosInstance.post(API_PATHS.AI.GENERATE_QUIZ, { documentId, numQuestions });

export const getSummary = (documentId) => axiosInstance.post(API_PATHS.AI.SUMMARY, { documentId });

export const explainConcept = (documentId, concept) =>
  axiosInstance.post(API_PATHS.AI.EXPLAIN, { documentId, concept });

export const sendChatMessage = (documentId, message) =>
  axiosInstance.post(API_PATHS.AI.CHAT, { documentId, message });

export const getChatHistory = (documentId) => axiosInstance.get(API_PATHS.AI.CHAT_HISTORY(documentId));
