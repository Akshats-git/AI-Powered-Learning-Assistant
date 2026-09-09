import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Flame, PartyPopper } from "lucide-react";

import { getDueQueue } from "../../services/reviewService";
import { reviewCard } from "../../services/flashcardService";

// The unified due queue: everything due today across every document,
// interleaved, in one session — the roadmap's "GET /api/review/due... with a
// daily cap and a session UI." Deliberately its own page rather than reusing
// FlashcardViewer: a queue item spans multiple documents/sets (it carries its
// own flashcardSetId per card), which FlashcardViewer's single-set shape
// doesn't model.
const GRADES = [
  { key: "1", grade: "again", label: "Again", className: "bg-red-50 text-red-600 hover:bg-red-100" },
  { key: "2", grade: "hard", label: "Hard", className: "bg-amber-50 text-amber-600 hover:bg-amber-100" },
  { key: "3", grade: "good", label: "Good", className: "bg-emerald-50 text-emerald-600 hover:bg-emerald-100" },
  { key: "4", grade: "easy", label: "Easy", className: "bg-blue-50 text-blue-600 hover:bg-blue-100" },
];

const ReviewSessionPage = () => {
  const [queue, setQueue] = useState(null);
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [reviewedCount, setReviewedCount] = useState(0);

  useEffect(() => {
    getDueQueue()
      .then((res) => setQueue(res.data.items))
      .catch(() => setQueue([]));
  }, []);

  const card = queue?.[index];

  const handleGrade = async (grade) => {
    setReviewedCount((prev) => prev + 1);
    setFlipped(false);
    setIndex((prev) => prev + 1);
    try {
      await reviewCard(card.flashcardSetId, card.cardId, grade);
    } catch {
      // error toast handled by the axios response interceptor; the card is
      // already past in this session either way — a failed grade write
      // isn't worth blocking the flow over.
    }
  };

  useEffect(() => {
    if (!card) return undefined;
    const handler = (e) => {
      if (e.key === " ") {
        e.preventDefault();
        setFlipped((prev) => !prev);
      }
      if (flipped) {
        const matched = GRADES.find((g) => g.key === e.key);
        if (matched) handleGrade(matched.grade);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card, flipped]);

  return (
    <div>
      <Link to="/dashboard" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-4">
        <ArrowLeft className="w-4 h-4" />
        Back to Dashboard
      </Link>

      <h1 className="text-2xl font-bold text-gray-900 mb-6">Review Session</h1>

      {queue === null ? (
        <div className="h-64 bg-white rounded-xl border border-gray-100 animate-pulse" />
      ) : queue.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 py-16 flex flex-col items-center text-center px-6">
          <PartyPopper className="w-10 h-10 text-primary mb-3" />
          <p className="text-lg font-semibold text-gray-900">Nothing due right now</p>
          <p className="text-sm text-gray-500 mt-1">Come back later, or generate more flashcards from a document.</p>
        </div>
      ) : !card ? (
        <div className="bg-white rounded-xl border border-gray-100 py-16 flex flex-col items-center text-center px-6">
          <Flame className="w-10 h-10 text-primary mb-3" />
          <p className="text-lg font-semibold text-gray-900">Session complete</p>
          <p className="text-sm text-gray-500 mt-1">
            You reviewed {reviewedCount} card{reviewedCount === 1 ? "" : "s"}.
          </p>
        </div>
      ) : (
        <div className="flex flex-col items-center">
          <div className="w-full max-w-xl">
            <div className="flex items-center justify-between mb-3 text-xs text-gray-400">
              <span>
                {index + 1} / {queue.length}
              </span>
              <span className="truncate max-w-[60%]" title={card.documentTitle || card.flashcardSetTitle}>
                {card.documentTitle || card.flashcardSetTitle}
              </span>
            </div>

            <button
              onClick={() => setFlipped((prev) => !prev)}
              className={`w-full min-h-[260px] rounded-2xl p-8 flex items-center justify-center text-center shadow-sm transition-colors ${
                flipped ? "bg-gradient-to-br from-primary to-primary-dark text-white" : "bg-white border border-gray-100 text-gray-900"
              }`}
            >
              <p className="text-lg font-medium">{flipped ? card.answer : card.question}</p>
            </button>

            {flipped ? (
              <div className="grid grid-cols-4 gap-2 mt-3">
                {GRADES.map(({ key, grade, label, className }) => (
                  <button
                    key={grade}
                    onClick={() => handleGrade(grade)}
                    className={`flex flex-col items-center gap-0.5 rounded-lg py-2 text-sm font-semibold transition-colors ${className}`}
                  >
                    {label}
                    <span className="text-[10px] font-normal opacity-60">{key}</span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-center text-xs text-gray-400 mt-2">Click the card (or press space) to flip</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default ReviewSessionPage;
