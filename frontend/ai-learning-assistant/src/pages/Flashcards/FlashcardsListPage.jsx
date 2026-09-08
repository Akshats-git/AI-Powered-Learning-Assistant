import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import moment from "moment";
import { Layers } from "lucide-react";

import { listFlashcardSets } from "../../services/flashcardService";

const CardSkeleton = () => (
  <div className="bg-white rounded-xl border border-gray-100 p-5 animate-pulse">
    <div className="h-4 w-32 bg-gray-100 rounded mb-2" />
    <div className="h-3 w-20 bg-gray-100 rounded mb-4" />
    <div className="h-2 w-full bg-gray-100 rounded" />
  </div>
);

const PAGE_SIZE = 12;

const FlashcardsListPage = () => {
  const navigate = useNavigate();
  const [sets, setSets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const fetchSets = (pageNum = 1) => {
    const isFirstPage = pageNum === 1;
    if (isFirstPage) setLoading(true);
    else setLoadingMore(true);

    listFlashcardSets({ page: pageNum, limit: PAGE_SIZE })
      .then((res) => {
        setSets((prev) => (isFirstPage ? res.data.items : [...prev, ...res.data.items]));
        setPage(res.data.page);
        setTotalPages(res.data.totalPages);
      })
      .finally(() => {
        if (isFirstPage) setLoading(false);
        else setLoadingMore(false);
      });
  };

  // One-time fetch on mount; loading is already true from useState's initial value.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(fetchSets, []);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">All Flashcard Sets</h1>
        <p className="text-sm text-gray-500 mt-1">Review flashcards generated from your documents.</p>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[0, 1, 2].map((i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
      ) : sets.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 p-12 flex flex-col items-center text-center">
          <div className="w-14 h-14 rounded-full bg-gray-50 flex items-center justify-center mb-4">
            <Layers className="w-6 h-6 text-gray-400" />
          </div>
          <p className="text-sm text-gray-500">
            No flashcards yet. Open a document and generate a set to get started.
          </p>
        </div>
      ) : (
        <>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {sets.map((set) => (
            <div key={set._id} className="bg-white rounded-xl border border-gray-100 p-5">
              <div className="flex items-start justify-between mb-3">
                <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                  <Layers className="w-5 h-5" />
                </div>
                <span className="text-xs font-semibold px-2 py-1 rounded-full bg-gray-50 text-gray-600">
                  {set.progressPercent}%
                </span>
              </div>

              <h3 className="text-sm font-semibold text-gray-900 truncate">{set.title}</h3>
              <p className="text-xs text-gray-400 mt-1 mb-3">
                {set.totalCards} cards · {moment(set.createdAt).fromNow()}
              </p>

              <div className="w-full h-1.5 rounded-full bg-gray-100 mb-4 overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-primary to-primary-dark transition-all"
                  style={{ width: `${set.progressPercent}%` }}
                />
              </div>

              <button
                onClick={() => navigate(`/documents/${set.document}/flashcards?setId=${set._id}`)}
                className="w-full px-3 py-2 rounded-lg text-sm font-medium text-primary-dark bg-primary/10 hover:bg-primary/20"
              >
                Study Now
              </button>
            </div>
          ))}
        </div>

        {page < totalPages && (
          <div className="flex justify-center mt-6">
            <button
              onClick={() => fetchSets(page + 1)}
              disabled={loadingMore}
              className="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 border border-gray-200 hover:bg-gray-50 disabled:opacity-60"
            >
              {loadingMore ? "Loading..." : "Load more"}
            </button>
          </div>
        )}
        </>
      )}
    </div>
  );
};

export default FlashcardsListPage;
