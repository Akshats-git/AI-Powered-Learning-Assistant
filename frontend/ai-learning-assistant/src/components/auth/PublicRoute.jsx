import { Navigate } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";

const PublicRoute = ({ children }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F9FAFB]">
        <p className="text-gray-500">Loading...</p>
      </div>
    );
  }

  // The read-only demo visitor is "logged in" but has no account of their own: they
  // must be able to reach sign-in and registration (registering replaces the demo session).
  if (user && !user.isDemo) {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
};

export default PublicRoute;
