import axiosInstance from "../utils/axiosInstance";
import { API_PATHS } from "../utils/apiPaths";

export const listFlashcardSets = (params) => axiosInstance.get(API_PATHS.FLASHCARDS.LIST, { params });

export const listFlashcardSetsForDocument = (documentId) =>
  axiosInstance.get(API_PATHS.FLASHCARDS.LIST_FOR_DOCUMENT(documentId));

export const getFlashcardSet = (setId) => axiosInstance.get(API_PATHS.FLASHCARDS.GET_SET(setId));

export const reviewCard = (setId, cardId) => axiosInstance.put(API_PATHS.FLASHCARDS.REVIEW_CARD(setId, cardId));

export const toggleFavoriteCard = (setId, cardId) =>
  axiosInstance.put(API_PATHS.FLASHCARDS.FAVORITE_CARD(setId, cardId));

export const deleteFlashcardSet = (setId) => axiosInstance.delete(API_PATHS.FLASHCARDS.DELETE_SET(setId));
