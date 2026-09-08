import { useEffect, useState } from "react";
import { AuthContext } from "../hooks/useAuth";
import * as authService from "../services/authService";
import { TOKEN_STORAGE_KEY } from "../utils/constants";

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem(TOKEN_STORAGE_KEY);
    if (!token) {
      // No token to verify, so we're already done loading.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLoading(false);
      return;
    }

    authService
      .getProfile()
      .then((res) => setUser(res.data.user))
      .catch(() => localStorage.removeItem(TOKEN_STORAGE_KEY))
      .finally(() => setLoading(false));
  }, []);

  const login = async (credentials) => {
    const res = await authService.login(credentials);
    localStorage.setItem(TOKEN_STORAGE_KEY, res.data.token);
    setUser(res.data.user);
    return res.data.user;
  };

  const register = async (data) => {
    const res = await authService.register(data);
    localStorage.setItem(TOKEN_STORAGE_KEY, res.data.token);
    setUser(res.data.user);
    return res.data.user;
  };

  const logout = () => {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    setUser(null);
  };

  const updateUser = (updates) => {
    setUser((prev) => ({ ...prev, ...updates }));
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
};
