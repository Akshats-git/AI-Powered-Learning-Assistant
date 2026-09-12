import { useEffect, useState } from "react";
import moment from "moment";
import toast from "react-hot-toast";
import { Monitor, ShieldCheck, X } from "lucide-react";

import { useAuth } from "../../hooks/useAuth";
import { listSessions, revokeSession } from "../../services/authService";

const describeSession = (userAgent) => {
  if (!userAgent) return "Unknown device";
  if (/mobile/i.test(userAgent)) return "Mobile browser";
  if (/chrome/i.test(userAgent)) return "Chrome";
  if (/firefox/i.test(userAgent)) return "Firefox";
  if (/safari/i.test(userAgent)) return "Safari";
  return userAgent.slice(0, 60);
};

const ActiveSessions = () => {
  const { logout } = useAuth();
  const [sessions, setSessions] = useState(null);
  const [revokingId, setRevokingId] = useState(null);

  useEffect(() => {
    listSessions()
      .then((res) => setSessions(res.data.sessions))
      .catch(() => setSessions([]));
  }, []);

  const handleRevoke = async (session) => {
    setRevokingId(session.familyId);
    try {
      await revokeSession(session.familyId);
      if (session.isCurrent) {
        toast.success("Signed out");
        logout();
        return;
      }
      setSessions((prev) => prev.filter((s) => s.familyId !== session.familyId));
      toast.success("Session signed out");
    } catch {
      // error toast handled by the axios response interceptor
    } finally {
      setRevokingId(null);
    }
  };

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-6">
      <h2 className="text-sm font-semibold text-gray-800 mb-1">Active Sessions</h2>
      <p className="text-xs text-gray-500 mb-4">Devices currently signed in to your account.</p>

      {sessions === null && <p className="text-sm text-gray-400">Loading sessions...</p>}
      {sessions?.length === 0 && <p className="text-sm text-gray-400">No active sessions.</p>}

      <ul className="space-y-2">
        {sessions?.map((session) => (
          <li
            key={session.familyId}
            className="flex items-center justify-between gap-3 rounded-lg border border-gray-100 px-4 py-3"
          >
            <div className="flex items-center gap-3 min-w-0">
              <Monitor className="w-4 h-4 text-gray-400 shrink-0" />
              <div className="min-w-0">
                <p className="text-sm text-gray-800 truncate">
                  {describeSession(session.userAgent)}
                  {session.ip && <span className="text-gray-400"> · {session.ip}</span>}
                </p>
                <p className="text-xs text-gray-400">Active {moment(session.lastActiveAt).fromNow()}</p>
              </div>
              {session.isCurrent && (
                <span className="flex items-center gap-1 text-xs font-medium text-emerald-600 shrink-0">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  This device
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={() => handleRevoke(session)}
              disabled={revokingId === session.familyId}
              className="flex items-center gap-1 text-xs font-medium text-red-500 hover:text-red-600 disabled:opacity-50 shrink-0"
            >
              <X className="w-3.5 h-3.5" />
              {session.isCurrent ? "Sign out" : "Revoke"}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default ActiveSessions;
