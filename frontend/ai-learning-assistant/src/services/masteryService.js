import axiosInstance from "../utils/axiosInstance";
import { API_PATHS } from "../utils/apiPaths";

// BKT-tracked concept mastery — see backend/controllers/masteryController.js.
export const getMastery = (documentId) =>
  axiosInstance.get(API_PATHS.MASTERY.LIST, { params: documentId ? { documentId } : undefined });
