import axiosInstance from "../utils/axiosInstance";
import { API_PATHS } from "../utils/apiPaths";

export const getOverview = () => axiosInstance.get(API_PATHS.DASHBOARD.OVERVIEW);
