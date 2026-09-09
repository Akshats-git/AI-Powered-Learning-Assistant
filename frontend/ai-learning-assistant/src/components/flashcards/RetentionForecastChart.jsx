import { useEffect, useState } from "react";
import { TrendingDown } from "lucide-react";

import { getForecast } from "../../services/reviewService";

// "Chart projected recall over the next 90 days per deck... falls straight
// out of FSRS" — this is the "if you stop reviewing from today" curve (see
// backend/utils/retentionForecast.js), not a promise about what happens if
// you keep to schedule (which would just hover near ~90% by definition).
const SAMPLE_EVERY_N_DAYS = 5;

const RetentionForecastChart = ({ setId }) => {
  const [points, setPoints] = useState(null);

  useEffect(() => {
    getForecast(setId)
      .then((res) => setPoints(res.data.points))
      .catch(() => setPoints([]));
  }, [setId]);

  if (points === null) {
    return <div className="h-32 bg-gray-50 rounded-lg animate-pulse" />;
  }

  const sampled = points.filter((p) => p.day % SAMPLE_EVERY_N_DAYS === 0 || p.day === points.length - 1);
  const hasData = sampled.some((p) => p.avgRetention !== null);

  if (!hasData) {
    return <p className="text-sm text-gray-500 py-6 text-center">Review a card in this deck to see a forecast.</p>;
  }

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-5">
      <div className="flex items-center gap-2 mb-4">
        <TrendingDown className="w-4 h-4 text-primary" />
        <h2 className="text-sm font-semibold text-gray-800">Projected Retention (next 90 days, if not reviewed further)</h2>
      </div>

      <div className="flex items-end gap-1 h-32">
        {sampled.map((point) => {
          const pct = Math.round((point.avgRetention ?? 0) * 100);
          return (
            <div key={point.day} className="flex-1 flex flex-col items-center justify-end h-full group relative">
              <div
                className={`w-full rounded-t transition-colors min-h-[2px] ${
                  pct >= 90 ? "bg-emerald-400 group-hover:bg-emerald-500" : pct >= 70 ? "bg-amber-400 group-hover:bg-amber-500" : "bg-red-400 group-hover:bg-red-500"
                }`}
                style={{ height: `${Math.max(pct, 2)}%` }}
                title={`Day ${point.day}: ${pct}% projected retention`}
              />
            </div>
          );
        })}
      </div>
      <div className="flex justify-between text-xs text-gray-400 mt-2">
        <span>Today</span>
        <span>Day 90</span>
      </div>
    </div>
  );
};

export default RetentionForecastChart;
