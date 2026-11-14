import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Flame, ArrowRight } from "lucide-react";

import { getDueQueue } from "../../services/reviewService";

// The one thing a returning learner most needs: "what should I do right now?" Hidden
// entirely when nothing is due, so an empty state never nags.
const DueTodayCard = () => {
  const [total, setTotal] = useState(0);

  useEffect(() => {
    getDueQueue(1)
      .then((res) => setTotal(res.data.total || 0))
      .catch(() => setTotal(0));
  }, []);

  if (total === 0) return null;

  return (
    <Link
      to="/review"
      className="mb-6 flex items-center justify-between gap-4 rounded-xl border border-primary/20 bg-primary/5 px-5 py-4 transition hover:bg-primary/10 focus-visible:outline-2 focus-visible:outline-primary"
    >
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary-dark">
          <Flame className="h-5 w-5" />
        </div>
        <div>
          <p className="text-sm font-semibold text-gray-900">
            {total} card{total === 1 ? "" : "s"} due for review
          </p>
          <p className="text-xs text-gray-500">A few minutes now keeps them from fading.</p>
        </div>
      </div>
      <span className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-primary-dark">
        Start review <ArrowRight className="h-4 w-4" />
      </span>
    </Link>
  );
};

export default DueTodayCard;
