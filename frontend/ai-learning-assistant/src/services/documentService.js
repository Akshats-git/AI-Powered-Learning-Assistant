import axiosInstance from "../utils/axiosInstance";
import { API_PATHS } from "../utils/apiPaths";

export const uploadDocument = (formData, onUploadProgress) =>
  axiosInstance.post(API_PATHS.DOCUMENTS.UPLOAD, formData, {
    headers: { "Content-Type": "multipart/form-data" },
    onUploadProgress,
  });

export const listDocuments = () => axiosInstance.get(API_PATHS.DOCUMENTS.LIST);

export const getDocument = (id) => axiosInstance.get(API_PATHS.DOCUMENTS.GET(id));

export const deleteDocument = (id) => axiosInstance.delete(API_PATHS.DOCUMENTS.DELETE(id));
