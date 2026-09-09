import { useEffect, useState } from "react";
import { DollarSign, Activity, Users, ShieldAlert } from "lucide-react";

import { getCostOverview } from "../../services/adminService";

const formatUsd = (value) => `$${(value ?? 0).toFixed(4)}`;

const StatCardSkeleton = () => (
  <div className="bg-white rounded-xl border border-gray-100 p-5 animate-pulse">
    <div className="w-10 h-10 rounded-lg bg-gray-100 mb-4" />
    <div className="h-6 w-16 bg-gray-100 rounded mb-2" />
    <div className="h-3 w-24 bg-gray-100 rounded" />
  </div>
);

const AdminCostDashboardPage = () => {
  const [overview, setOverview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [days, setDays] = useState(30);

  useEffect(() => {
    getCostOverview({ days })
      .then((res) => setOverview(res.data))
      .catch((err) => {
        if (err.response?.status === 403) setForbidden(true);
      })
      .finally(() => setLoading(false));
  }, [days]);

  const maxDayCost = Math.max(1e-9, ...(overview?.byDay || []).map((d) => d.costUsd));

  if (!loading && forbidden) {
    return (
      <div className="bg-white rounded-xl border border-gray-100 p-12 flex flex-col items-center text-center">
        <div className="w-14 h-14 rounded-full bg-red-50 flex items-center justify-center mb-4">
          <ShieldAlert className="w-6 h-6 text-red-500" />
        </div>
        <p className="text-sm text-gray-500">You don't have access to this page.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">LLM Cost Dashboard</h1>
          <p className="text-sm text-gray-500 mt-1">Spend and usage across every user, from the LlmCall ledger.</p>
        </div>
        <select
          value={days}
          onChange={(e) => {
            setLoading(true);
            setDays(Number(e.target.value));
          }}
          className="text-sm border border-gray-200 rounded-lg px-3 py-2 text-gray-700"
        >
          <option value={7}>Last 7 days</option>
          <option value={30}>Last 30 days</option>
          <option value={90}>Last 90 days</option>
        </select>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        {loading ? (
          <>
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
          </>
        ) : (
          <>
            <div className="bg-white rounded-xl border border-gray-100 p-5">
              <div className="w-10 h-10 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center mb-4">
                <DollarSign className="w-5 h-5" />
              </div>
              <p className="text-2xl font-bold text-gray-900">{formatUsd(overview.totalCostUsd)}</p>
              <p className="text-sm text-gray-500 mt-1">Total spend ({overview.days}d)</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-100 p-5">
              <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center mb-4">
                <Activity className="w-5 h-5" />
              </div>
              <p className="text-2xl font-bold text-gray-900">{overview.totalCalls}</p>
              <p className="text-sm text-gray-500 mt-1">LLM calls</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-100 p-5">
              <div className="w-10 h-10 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center mb-4">
                <Users className="w-5 h-5" />
              </div>
              <p className="text-2xl font-bold text-gray-900">{overview.byUser.length}</p>
              <p className="text-sm text-gray-500 mt-1">Active spenders</p>
            </div>
          </>
        )}
      </div>

      <div className="bg-white rounded-xl border border-gray-100 p-5 mb-8">
        <h2 className="text-sm font-semibold text-gray-800 mb-4">Spend per day</h2>
        {loading ? (
          <div className="h-32 bg-gray-50 rounded-lg animate-pulse" />
        ) : overview.byDay.length === 0 ? (
          <p className="text-sm text-gray-500 py-6 text-center">No LLM calls in this window.</p>
        ) : (
          <div className="flex items-end gap-1 h-32">
            {overview.byDay.map((day) => (
              <div key={day.date} className="flex-1 flex flex-col items-center justify-end h-full group relative">
                <div
                  className="w-full rounded-t bg-primary/70 group-hover:bg-primary transition-colors min-h-[2px]"
                  style={{ height: `${Math.max((day.costUsd / maxDayCost) * 100, 2)}%` }}
                  title={`${day.date}: ${formatUsd(day.costUsd)} (${day.calls} calls)`}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl border border-gray-100 p-5">
        <h2 className="text-sm font-semibold text-gray-800 mb-4">Spend by user</h2>
        {loading ? (
          <div className="h-32 bg-gray-50 rounded-lg animate-pulse" />
        ) : overview.byUser.length === 0 ? (
          <p className="text-sm text-gray-500 py-6 text-center">No LLM calls in this window.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-400 border-b border-gray-100">
                  <th className="py-2 font-medium">User</th>
                  <th className="py-2 font-medium text-right">Calls</th>
                  <th className="py-2 font-medium text-right">Tokens</th>
                  <th className="py-2 font-medium text-right">Spend</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {overview.byUser.map((row) => (
                  <tr key={row.userId}>
                    <td className="py-2.5 text-gray-800">{row.email || row.userId}</td>
                    <td className="py-2.5 text-right text-gray-600">{row.calls}</td>
                    <td className="py-2.5 text-right text-gray-600">{row.totalTokens.toLocaleString()}</td>
                    <td className="py-2.5 text-right font-medium text-gray-900">{formatUsd(row.costUsd)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminCostDashboardPage;
