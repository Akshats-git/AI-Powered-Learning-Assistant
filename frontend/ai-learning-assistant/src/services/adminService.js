import axiosInstance from "../utils/axiosInstance";
import { API_PATHS } from "../utils/apiPaths";

export const getCostOverview = (params) => axiosInstance.get(API_PATHS.ADMIN.COSTS, { params });
