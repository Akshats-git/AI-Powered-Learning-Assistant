import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Lock, ArrowRight } from "lucide-react";
import toast from "react-hot-toast";

import AuthLayout from "../../components/layout/AuthLayout";
import * as authService from "../../services/authService";

const ResetPasswordPage = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get("token") || "";

  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }

    setSubmitting(true);
    try {
      await authService.resetPassword({ token, newPassword: password });
      toast.success("Password reset. Please sign in.");
      navigate("/login");
    } catch {
      // error toast is handled by the axios response interceptor
    } finally {
      setSubmitting(false);
    }
  };

  if (!token) {
    return (
      <AuthLayout title="Invalid link" subtitle="This reset link is missing its token">
        <p className="text-sm text-gray-600 text-center">
          Request a new one from the{" "}
          <Link to="/forgot-password" className="text-primary font-medium hover:underline">
            forgot password
          </Link>{" "}
          page.
        </p>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Set a new password" subtitle="Choose a new password for your account">
      <form onSubmit={handleSubmit} className="space-y-5" noValidate>
        <div>
          <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1.5">
            New password
          </label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setError("");
              }}
              placeholder="••••••••"
              className={`w-full pl-10 pr-3 py-2.5 rounded-lg border text-sm outline-none transition focus:ring-2 focus:ring-primary/30 ${
                error ? "border-red-300" : "border-gray-200 focus:border-primary"
              }`}
            />
          </div>
          {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-white text-sm font-medium bg-gradient-to-r from-primary to-primary-dark hover:opacity-90 transition disabled:opacity-60"
        >
          {submitting ? "Resetting..." : (
            <>
              Reset password <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>
      </form>
    </AuthLayout>
  );
};

export default ResetPasswordPage;
