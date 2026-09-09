import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { CheckCircle2, XCircle, Loader2 } from "lucide-react";

import AuthLayout from "../../components/layout/AuthLayout";
import { useAuth } from "../../hooks/useAuth";
import * as authService from "../../services/authService";

const VerifyEmailPage = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") || "";
  const { user, updateUser } = useAuth() || {};

  const [status, setStatus] = useState(token ? "verifying" : "missing");

  useEffect(() => {
    if (!token) return;

    authService
      .verifyEmail({ token })
      .then(() => {
        setStatus("success");
        // If the browser that clicked the link is also the one that's
        // logged in, reflect the change immediately instead of waiting for
        // a page reload to notice it.
        if (user) updateUser?.({ emailVerifiedAt: new Date().toISOString() });
      })
      .catch(() => setStatus("error"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  if (status === "missing") {
    return (
      <AuthLayout title="Invalid link" subtitle="This verification link is missing its token">
        <p className="text-sm text-gray-600 text-center">
          <Link to="/login" className="text-primary font-medium hover:underline">
            Back to sign in
          </Link>
        </p>
      </AuthLayout>
    );
  }

  if (status === "verifying") {
    return (
      <AuthLayout title="Verifying your email" subtitle="Just a moment">
        <div className="flex justify-center py-4">
          <Loader2 className="w-6 h-6 text-primary animate-spin" />
        </div>
      </AuthLayout>
    );
  }

  if (status === "error") {
    return (
      <AuthLayout title="Verification failed" subtitle="This link is invalid or has expired">
        <div className="flex flex-col items-center text-center gap-3">
          <XCircle className="w-10 h-10 text-red-400" />
          <p className="text-sm text-gray-600">
            Request a new link from your{" "}
            <Link to="/profile" className="text-primary font-medium hover:underline">
              profile page
            </Link>
            , or{" "}
            <Link to="/login" className="text-primary font-medium hover:underline">
              sign in
            </Link>
            .
          </p>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Email verified" subtitle="Your email address is confirmed">
      <div className="flex flex-col items-center text-center gap-3">
        <CheckCircle2 className="w-10 h-10 text-emerald-500" />
        <Link
          to={user ? "/dashboard" : "/login"}
          className="text-sm font-medium text-primary hover:underline"
        >
          {user ? "Go to dashboard" : "Back to sign in"}
        </Link>
      </div>
    </AuthLayout>
  );
};

export default VerifyEmailPage;
