import { useState } from "react";
import { Download, Trash2, Lock } from "lucide-react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";

import { useAuth } from "../../hooks/useAuth";
import { downloadMyData, deleteAccount } from "../../services/authService";
import Modal from "../ui/Modal";

const DataAndAccount = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [exporting, setExporting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [password, setPassword] = useState("");
  const [deleting, setDeleting] = useState(false);

  const handleExport = async () => {
    setExporting(true);
    try {
      await downloadMyData();
    } catch {
      // axiosInstance already toasts
    } finally {
      setExporting(false);
    }
  };

  const handleDelete = async (e) => {
    e.preventDefault();
    if (!password) return;
    setDeleting(true);
    try {
      await deleteAccount(password);
      logout();
      toast.success("Your account and data were deleted");
      navigate("/login", { replace: true });
    } catch {
      setDeleting(false);
    }
  };

  const close = () => {
    setConfirming(false);
    setPassword("");
  };

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-6">
      <h2 className="text-sm font-semibold text-gray-800 mb-1">Your data</h2>
      <p className="text-sm text-gray-500 mb-4">Download everything the app holds about you, or delete your account and all of it for good.</p>

      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={handleExport}
          disabled={exporting}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
        >
          <Download className="w-4 h-4" />
          {exporting ? "Preparing..." : "Download my data"}
        </button>
        {!user?.isDemo && (
          <button
            onClick={() => setConfirming(true)}
            className="inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50"
          >
            <Trash2 className="w-4 h-4" />
            Delete account
          </button>
        )}
      </div>

      {confirming && (
        <Modal
          title="Delete your account?"
          onClose={close}
          size="sm"
          footer={
            <div className="flex justify-end gap-3">
              <button onClick={close} className="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50">
                Cancel
              </button>
              <button
                type="submit"
                form="delete-account-form"
                disabled={deleting || !password}
                className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-red-600 hover:bg-red-700 disabled:opacity-60"
              >
                {deleting ? "Deleting..." : "Delete everything"}
              </button>
            </div>
          }
        >
          <form id="delete-account-form" onSubmit={handleDelete} className="space-y-3">
            <p className="text-sm text-gray-500">
              This permanently deletes your documents, flashcards, quizzes, chats and progress. It can&apos;t be undone. Enter your password to confirm.
            </p>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                aria-label="Password"
                autoComplete="current-password"
                className="w-full pl-10 pr-3 py-2.5 rounded-lg border border-gray-200 text-sm outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              />
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
};

export default DataAndAccount;
