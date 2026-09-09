import axios from "axios";
import toast from "react-hot-toast";
import { TOKEN_STORAGE_KEY } from "./constants";
import { API_PATHS } from "./apiPaths";

const axiosInstance = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
  // The refresh token only exists as an httpOnly cookie — this is what lets
  // the browser actually send it on the one request that needs it.
  withCredentials: true,
  headers: {
    "Content-Type": "application/json",
  },
});

axiosInstance.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem(TOKEN_STORAGE_KEY);
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

const AUTH_ENDPOINTS = [API_PATHS.AUTH.LOGIN, API_PATHS.AUTH.REGISTER, API_PATHS.AUTH.REFRESH, API_PATHS.AUTH.LOGOUT];

// Concurrent 401s (e.g. a page firing several requests at once after the
// access token expired) should trigger exactly one refresh call, not one
// per request — everyone else just waits on this shared promise.
let refreshPromise = null;

const attemptRefresh = () => {
  if (!refreshPromise) {
    refreshPromise = axios
      .post(`${import.meta.env.VITE_API_BASE_URL}${API_PATHS.AUTH.REFRESH}`, null, { withCredentials: true })
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
};

const forceLogout = (message) => {
  localStorage.removeItem(TOKEN_STORAGE_KEY);
  toast.error(message);
  if (window.location.pathname !== "/login") {
    window.location.href = "/login";
  }
};

// Exported (rather than inlined in .use()) so it can be unit tested without
// having to fake a real failing HTTP round-trip.
export const handleResponseError = async (error) => {
  const message = error.response?.data?.error?.message || error.message || "Something went wrong";
  const originalRequest = error.config;
  const requestUrl = originalRequest?.url || "";
  const isAuthEndpoint = AUTH_ENDPOINTS.some((path) => requestUrl.includes(path));

  if (error.response?.status === 401 && !isAuthEndpoint && !originalRequest._retriedAfterRefresh) {
    originalRequest._retriedAfterRefresh = true;
    try {
      const { data } = await attemptRefresh();
      localStorage.setItem(TOKEN_STORAGE_KEY, data.token);
      originalRequest.headers.Authorization = `Bearer ${data.token}`;
      return axiosInstance.request(originalRequest);
    } catch {
      forceLogout(message);
      return Promise.reject(error);
    }
  }

  if (error.response?.status === 401 && !isAuthEndpoint) {
    forceLogout(message);
  } else {
    toast.error(message);
  }

  return Promise.reject(error);
};

axiosInstance.interceptors.response.use((response) => response, handleResponseError);

export default axiosInstance;
