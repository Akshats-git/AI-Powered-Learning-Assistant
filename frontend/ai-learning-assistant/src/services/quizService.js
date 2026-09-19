import axiosInstance from "../utils/axiosInstance";
import { API_PATHS } from "../utils/apiPaths";
import { saveBlob, filenameFromDisposition } from "../utils/download";

export const listQuizzes = (params) => axiosInstance.get(API_PATHS.QUIZZES.LIST, { params });

export const listQuizzesForDocument = (documentId) =>
  axiosInstance.get(API_PATHS.QUIZZES.LIST_FOR_DOCUMENT(documentId));

export const getQuiz = (id) => axiosInstance.get(API_PATHS.QUIZZES.GET(id));

export const submitQuiz = (id, answers) => axiosInstance.post(API_PATHS.QUIZZES.SUBMIT(id), { answers });

export const getQuizResults = (id) => axiosInstance.get(API_PATHS.QUIZZES.RESULTS(id));

export const deleteQuiz = (id) => axiosInstance.delete(API_PATHS.QUIZZES.DELETE(id));

// A finished quiz, with the answer key and your answers, as Markdown.
export const downloadQuiz = async (id, fallbackName = "quiz") => {
  const res = await axiosInstance.get(API_PATHS.QUIZZES.EXPORT(id), { responseType: "blob" });
  saveBlob(res.data, filenameFromDisposition(res.headers["content-disposition"], `${fallbackName}.md`));
};
