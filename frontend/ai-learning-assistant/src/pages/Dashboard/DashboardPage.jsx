import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { FileText, Layers, HelpCircle, ArrowRight, Inbox } from "lucide-react";
import { timeAgo } from "../../utils/helpers";

import { getOverview } from "../../services/dashboardService";
import { useAuth } from "../../hooks/useAuth";
import WeakAreasPanel from "../../components/dashboard/WeakAreasPanel";
import StreakBadge from "../../components/dashboard/StreakBadge";
import DueTodayCard from "../../components/dashboard/DueTodayCard";

const STAT_CARDS = [
  { key: "totalDocuments", label: "Total Documents", icon: FileText, tint: "bg-emerald-50 text-emerald-600" },
  { key: "totalFlashcards", label: "Total Flashcards", icon: Layers, tint: "bg-blue-50 text-blue-600" },
  { key: "totalQuizzes", label: "Total Quizzes", icon: HelpCircle, tint: "bg-purple-50 text-purple-600" },
];

const StatCardSkeleton = () => (
  <div className="bg-white rounded-xl border border-gray-100 p-3 sm:p-5 animate-pulse">
    <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-gray-100 mb-3 sm:mb-4" />
    <div className="h-6 w-16 bg-gray-100 rounded mb-2" />
    <div className="h-3 w-24 bg-gray-100 rounded" />
  </div>
);

const ActivitySkeleton = () => (
  <div className="space-y-3">
    {[0, 1, 2].map((i) => (
      <div key={i} className="flex items-center justify-between animate-pulse">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-gray-100" />
          <div className="h-3 w-40 bg-gray-100 rounded" />
        </div>
        <div className="h-3 w-12 bg-gray-100 rounded" />
      </div>
    ))}
  </div>
);

const DashboardPage = () => {
  const { user } = useAuth();
  const [overview, setOverview] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getOverview()
      .then((res) => setOverview(res.data))
      .finally(() => setLoading(false));
  }, []);

  const isEmpty =
    !loading &&
    overview &&
    overview.totalDocuments === 0 &&
    overview.totalFlashcards === 0 &&
    overview.totalQuizzes === 0;

  return (
    <div>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-sm text-gray-500 mt-1">Welcome back{user?.username ? `, ${user.username}` : ""}.</p>
        </div>
        <StreakBadge />
      </div>

      <DueTodayCard />

      {/* Three across even on a phone: stacked, they filled the whole first screen. */}
      <div className="grid grid-cols-3 gap-2 sm:gap-4 mb-8">
        {loading
          ? STAT_CARDS.map((c) => <StatCardSkeleton key={c.key} />)
          : STAT_CARDS.map(({ key, label, icon: Icon, tint }) => (
              <div key={key} className="bg-white rounded-xl border border-gray-100 p-3 sm:p-5">
                <div className={`w-8 h-8 sm:w-10 sm:h-10 rounded-lg flex items-center justify-center mb-3 sm:mb-4 ${tint}`}>
                  <Icon className="w-4 h-4 sm:w-5 sm:h-5" />
                </div>
                <p className="text-xl sm:text-2xl font-bold text-gray-900">{overview?.[key] ?? 0}</p>
                <p className="text-xs sm:text-sm text-gray-500 mt-1">{label}</p>
              </div>
            ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
        <div className="bg-white rounded-xl border border-gray-100 p-5 lg:col-span-2">
          <h2 className="text-sm font-semibold text-gray-800 mb-4">Recent Activity</h2>

          {loading ? (
            <ActivitySkeleton />
          ) : isEmpty ? (
            <div className="flex flex-col items-center text-center py-10">
              <div className="w-12 h-12 rounded-full bg-gray-50 flex items-center justify-center mb-3">
                <Inbox className="w-5 h-5 text-gray-400" />
              </div>
              <p className="text-sm text-gray-500 mb-3">No activity yet. Upload a document to get started.</p>
              <Link
                to="/documents"
                className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
              >
                Go to Documents <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          ) : overview.recentActivity.length === 0 ? (
            <p className="text-sm text-gray-500 py-6 text-center">No recent activity yet.</p>
          ) : (
            <ul className="divide-y divide-gray-50">
              {overview.recentActivity.map((activity) => (
                <li key={activity.link} className="flex items-center justify-between py-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-lg bg-gray-50 flex items-center justify-center shrink-0">
                      <FileText className="w-4 h-4 text-gray-400" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{activity.label}</p>
                      <p className="text-xs text-gray-400">{timeAgo(activity.timestamp)}</p>
                    </div>
                  </div>
                  <Link to={activity.link} className="py-2.5 -my-2.5 pl-3 text-xs font-medium text-primary hover:underline shrink-0">
                    View
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        <WeakAreasPanel />
      </div>
    </div>
  );
};

export default DashboardPage;
