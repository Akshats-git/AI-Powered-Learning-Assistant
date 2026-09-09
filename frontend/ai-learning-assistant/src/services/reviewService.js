import axiosInstance from "../utils/axiosInstance";
import { API_PATHS } from "../utils/apiPaths";

// The unified due queue: every card due right now, across every document,
// interleaved — see backend/controllers/reviewController.js.
export const getDueQueue = (limit) => axiosInstance.get(API_PATHS.REVIEW.DUE, { params: limit ? { limit } : undefined });
