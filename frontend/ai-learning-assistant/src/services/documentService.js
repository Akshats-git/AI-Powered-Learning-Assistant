import axiosInstance from "../utils/axiosInstance";
import { API_PATHS } from "../utils/apiPaths";

export const uploadDocument = (formData, onUploadProgress) =>
  axiosInstance.post(API_PATHS.DOCUMENTS.UPLOAD, formData, {
    headers: { "Content-Type": "multipart/form-data" },
    onUploadProgress,
  });

export const listDocuments = (params) => axiosInstance.get(API_PATHS.DOCUMENTS.LIST, { params });

export const getDocument = (id) => axiosInstance.get(API_PATHS.DOCUMENTS.GET(id));

export const renameDocument = (id, title) => axiosInstance.patch(API_PATHS.DOCUMENTS.RENAME(id), { title });

export const deleteDocument = (id) => axiosInstance.delete(API_PATHS.DOCUMENTS.DELETE(id));

// `fileUrl` comes from the API (`/api/documents/:id/file`) and needs the bearer token.
export const fetchDocumentFile = (fileUrl) => axiosInstance.get(fileUrl, { responseType: "blob" });
