import { useState } from "react";
import { Mail, X } from "lucide-react";
import toast from "react-hot-toast";

import { useAuth } from "../../hooks/useAuth";
import * as authService from "../../services/authService";

const VerifyEmailBanner = () => {
  const { user } = useAuth();
  const [dismissed, setDismissed] = useState(false);
  const [sending, setSending] = useState(false);

  if (!user || user.emailVerifiedAt || dismissed) return null;

  const handleResend = async () => {
    setSending(true);
    try {
      await authService.resendVerification();
      toast.success("Verification email sent — check your inbox.");
    } catch {
      // error toast is handled by the axios response interceptor
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-3 px-4 py-2.5 mb-4 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-800">
      <Mail className="w-4 h-4 shrink-0" />
      <p className="flex-1 min-w-[200px]">Please verify your email address to secure your account.</p>
      <button
        type="button"
        onClick={handleResend}
        disabled={sending}
        className="font-medium underline underline-offset-2 hover:no-underline disabled:opacity-60"
      >
        {sending ? "Sending..." : "Resend verification email"}
      </button>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label="Dismiss"
        className="p-1 rounded hover:bg-amber-100"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
};

export default VerifyEmailBanner;
