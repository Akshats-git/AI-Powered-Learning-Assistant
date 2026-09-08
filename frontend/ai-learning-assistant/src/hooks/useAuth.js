import { createContext, useContext } from "react";

// Lives here (not in context/AuthContext.jsx) so that file only exports the
// AuthProvider component, which Fast Refresh requires for hot reload to work.
export const AuthContext = createContext(null);

export const useAuth = () => useContext(AuthContext);
