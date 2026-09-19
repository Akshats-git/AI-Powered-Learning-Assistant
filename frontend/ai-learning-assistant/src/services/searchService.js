import axiosInstance from "../utils/axiosInstance";
import { API_PATHS } from "../utils/apiPaths";

export const searchAll = (q, { signal } = {}) => axiosInstance.get(API_PATHS.SEARCH, { params: { q }, signal });
