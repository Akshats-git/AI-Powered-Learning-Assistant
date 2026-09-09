import { useEffect, useState } from "react";
import { Flame } from "lucide-react";

import { getStreak } from "../../services/reviewService";

// "Streaks... cheap to build, and they're what make the demo feel like a
// product someone uses." Recomputed server-side from ReviewLog on every
// load — see backend/utils/streaks.js.
const StreakBadge = () => {
  const [streak, setStreak] = useState(null);

  useEffect(() => {
    getStreak()
      .then((res) => setStreak(res.data))
      .catch(() => setStreak(null));
  }, []);

  if (!streak || streak.currentStreak === 0) return null;

  return (
    <div
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold ${
        streak.activeToday ? "bg-orange-50 text-orange-600" : "bg-gray-50 text-gray-500"
      }`}
      title={streak.activeToday ? "Reviewed today" : "Review today to keep your streak"}
    >
      <Flame className={`w-4 h-4 ${streak.activeToday ? "fill-orange-400 text-orange-500" : ""}`} />
      {streak.currentStreak} day{streak.currentStreak === 1 ? "" : "s"}
    </div>
  );
};

export default StreakBadge;
