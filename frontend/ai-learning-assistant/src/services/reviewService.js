import axiosInstance from "../utils/axiosInstance";
import { API_PATHS } from "../utils/apiPaths";

// The unified due queue: every card due right now, across every document,
// interleaved — see backend/controllers/reviewController.js.
export const getDueQueue = (limit) => axiosInstance.get(API_PATHS.REVIEW.DUE, { params: limit ? { limit } : undefined });

// Consecutive-day review streak, recomputed from ReviewLog on every request.
export const getStreak = () => axiosInstance.get(API_PATHS.REVIEW.STREAK);

// 90-day projected-recall curve for one flashcard set, derived from FSRS's
// own retrievability formula.
export const getForecast = (setId) => axiosInstance.get(API_PATHS.REVIEW.FORECAST(setId));
