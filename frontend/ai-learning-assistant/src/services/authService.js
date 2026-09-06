import axiosInstance from "../utils/axiosInstance";
import { API_PATHS } from "../utils/apiPaths";

export const register = (data) => axiosInstance.post(API_PATHS.AUTH.REGISTER, data);

export const login = (data) => axiosInstance.post(API_PATHS.AUTH.LOGIN, data);

export const getProfile = () => axiosInstance.get(API_PATHS.AUTH.PROFILE);

export const updatePassword = (data) => axiosInstance.put(API_PATHS.AUTH.UPDATE_PASSWORD, data);
