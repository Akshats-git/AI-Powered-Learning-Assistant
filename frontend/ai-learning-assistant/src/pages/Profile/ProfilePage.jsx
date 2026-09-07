import { useState } from "react";
import toast from "react-hot-toast";
import { User, Mail, Lock } from "lucide-react";

import { useAuth } from "../../hooks/useAuth";
import { updatePassword } from "../../services/authService";

const ProfilePage = () => {
  const { user } = useAuth();

  const [form, setForm] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  const handleChange = (field) => (e) => {
    setForm((prev) => ({ ...prev, [field]: e.target.value }));
    setErrors((prev) => ({ ...prev, [field]: undefined }));
  };

  const validate = () => {
    const nextErrors = {};
    if (!form.currentPassword) {
      nextErrors.currentPassword = "Current password is required";
    }
    if (form.newPassword.length < 6) {
      nextErrors.newPassword = "New password must be at least 6 characters";
    }
    if (form.confirmPassword !== form.newPassword) {
      nextErrors.confirmPassword = "Passwords do not match";
    }
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;

    setSubmitting(true);
    try {
      await updatePassword({ currentPassword: form.currentPassword, newPassword: form.newPassword });
      toast.success("Password updated successfully");
      setForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
    } catch {
      // error toast handled by the axios response interceptor
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Profile</h1>
        <p className="text-sm text-gray-500 mt-1">Manage your account information and password.</p>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 p-6">
        <h2 className="text-sm font-semibold text-gray-800 mb-4">User Information</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Username</label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={user?.username || ""}
                disabled
                className="w-full pl-10 pr-3 py-2.5 rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-500"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Email</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="email"
                value={user?.email || ""}
                disabled
                className="w-full pl-10 pr-3 py-2.5 rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-500"
              />
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 p-6">
        <h2 className="text-sm font-semibold text-gray-800 mb-4">Change Password</h2>
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div>
            <label htmlFor="currentPassword" className="block text-sm font-medium text-gray-700 mb-1.5">
              Current Password
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                id="currentPassword"
                type="password"
                value={form.currentPassword}
                onChange={handleChange("currentPassword")}
                className={`w-full pl-10 pr-3 py-2.5 rounded-lg border text-sm outline-none focus:ring-2 focus:ring-primary/30 ${
                  errors.currentPassword ? "border-red-300" : "border-gray-200 focus:border-primary"
                }`}
              />
            </div>
            {errors.currentPassword && <p className="mt-1 text-xs text-red-500">{errors.currentPassword}</p>}
          </div>

          <div>
            <label htmlFor="newPassword" className="block text-sm font-medium text-gray-700 mb-1.5">
              New Password
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                id="newPassword"
                type="password"
                value={form.newPassword}
                onChange={handleChange("newPassword")}
                className={`w-full pl-10 pr-3 py-2.5 rounded-lg border text-sm outline-none focus:ring-2 focus:ring-primary/30 ${
                  errors.newPassword ? "border-red-300" : "border-gray-200 focus:border-primary"
                }`}
              />
            </div>
            {errors.newPassword && <p className="mt-1 text-xs text-red-500">{errors.newPassword}</p>}
          </div>

          <div>
            <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-1.5">
              Confirm New Password
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                id="confirmPassword"
                type="password"
                value={form.confirmPassword}
                onChange={handleChange("confirmPassword")}
                className={`w-full pl-10 pr-3 py-2.5 rounded-lg border text-sm outline-none focus:ring-2 focus:ring-primary/30 ${
                  errors.confirmPassword ? "border-red-300" : "border-gray-200 focus:border-primary"
                }`}
              />
            </div>
            {errors.confirmPassword && <p className="mt-1 text-xs text-red-500">{errors.confirmPassword}</p>}
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="px-5 py-2.5 rounded-lg text-sm font-medium text-white bg-gradient-to-r from-primary to-primary-dark hover:opacity-90 disabled:opacity-60"
          >
            {submitting ? "Updating..." : "Update Password"}
          </button>
        </form>
      </div>
    </div>
  );
};

export default ProfilePage;
