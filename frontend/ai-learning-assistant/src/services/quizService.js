import axiosInstance from "../utils/axiosInstance";
import { API_PATHS } from "../utils/apiPaths";

export const listQuizzes = () => axiosInstance.get(API_PATHS.QUIZZES.LIST);

export const listQuizzesForDocument = (documentId) =>
  axiosInstance.get(API_PATHS.QUIZZES.LIST_FOR_DOCUMENT(documentId));

export const getQuiz = (id) => axiosInstance.get(API_PATHS.QUIZZES.GET(id));

export const submitQuiz = (id, answers) => axiosInstance.post(API_PATHS.QUIZZES.SUBMIT(id), { answers });

export const getQuizResults = (id) => axiosInstance.get(API_PATHS.QUIZZES.RESULTS(id));

export const deleteQuiz = (id) => axiosInstance.delete(API_PATHS.QUIZZES.DELETE(id));
