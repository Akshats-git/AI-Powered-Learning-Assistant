import { useState } from "react";
import { Link } from "react-router-dom";
import { Mail, ArrowRight, ArrowLeft } from "lucide-react";
import toast from "react-hot-toast";

import AuthLayout from "../../components/layout/AuthLayout";
import * as authService from "../../services/authService";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const ForgotPasswordPage = () => {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!EMAIL_REGEX.test(email)) {
      setError("Enter a valid email address");
      return;
    }

    setSubmitting(true);
    try {
      await authService.forgotPassword({ email });
      setSent(true);
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout title="Reset your password" subtitle="We'll email you a link to get back in">
      {sent ? (
        <div className="text-center">
          <p className="text-sm text-gray-600">
            If an account exists for <span className="font-medium text-gray-900">{email}</span>, a reset link is on
            its way. It expires in 1 hour.
          </p>
          <Link
            to="/login"
            className="mt-6 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
          >
            <ArrowLeft className="w-4 h-4" /> Back to sign in
          </Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-5" noValidate>
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1.5">
              Email
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setError("");
                }}
                placeholder="you@example.com"
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
            {submitting ? "Sending..." : (
              <>
                Send reset link <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>

          <p className="text-center text-sm text-gray-500">
            <Link to="/login" className="text-primary font-medium hover:underline">
              Back to sign in
            </Link>
          </p>
        </form>
      )}
    </AuthLayout>
  );
};

export default ForgotPasswordPage;
