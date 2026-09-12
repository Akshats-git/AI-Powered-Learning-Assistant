import axiosInstance from "../utils/axiosInstance";
import { API_PATHS } from "../utils/apiPaths";

export const register = (data) => axiosInstance.post(API_PATHS.AUTH.REGISTER, data);

export const login = (data) => axiosInstance.post(API_PATHS.AUTH.LOGIN, data);

// Reads the httpOnly refresh cookie server-side and mints a new access
// token — no body needed, the cookie rides along via withCredentials.
export const refresh = () => axiosInstance.post(API_PATHS.AUTH.REFRESH);

export const logout = () => axiosInstance.post(API_PATHS.AUTH.LOGOUT);

export const getProfile = () => axiosInstance.get(API_PATHS.AUTH.PROFILE);

export const updatePassword = (data) => axiosInstance.put(API_PATHS.AUTH.UPDATE_PASSWORD, data);

export const forgotPassword = (data) => axiosInstance.post(API_PATHS.AUTH.FORGOT_PASSWORD, data);

export const resetPassword = (data) => axiosInstance.post(API_PATHS.AUTH.RESET_PASSWORD, data);

export const verifyEmail = (data) => axiosInstance.post(API_PATHS.AUTH.VERIFY_EMAIL, data);

export const resendVerification = () => axiosInstance.post(API_PATHS.AUTH.RESEND_VERIFICATION);

export const listSessions = () => axiosInstance.get(API_PATHS.AUTH.SESSIONS);

export const revokeSession = (familyId) => axiosInstance.delete(API_PATHS.AUTH.REVOKE_SESSION(familyId));

export const saveApiKey = (apiKey) => axiosInstance.put(API_PATHS.AUTH.API_KEY, { apiKey });

export const removeApiKey = () => axiosInstance.delete(API_PATHS.AUTH.API_KEY);
