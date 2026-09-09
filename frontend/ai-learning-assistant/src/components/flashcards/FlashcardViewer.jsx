import { useEffect, useState } from "react";
import { Star, ChevronLeft, ChevronRight } from "lucide-react";

const DIFFICULTY_STYLES = {
  easy: "bg-emerald-50 text-emerald-600",
  medium: "bg-amber-50 text-amber-600",
  hard: "bg-red-50 text-red-600",
};

// The 4-point grading scale the backend's FSRS scheduler grades on
// (backend/utils/fsrs.js) — replacing a binary "flipped = reviewed." Key is
// the digit that grades it (roadmap: "1-4 grade"); label/style are just UI.
const GRADES = [
  { key: "1", grade: "again", label: "Again", className: "bg-red-50 text-red-600 hover:bg-red-100" },
  { key: "2", grade: "hard", label: "Hard", className: "bg-amber-50 text-amber-600 hover:bg-amber-100" },
  { key: "3", grade: "good", label: "Good", className: "bg-emerald-50 text-emerald-600 hover:bg-emerald-100" },
  { key: "4", grade: "easy", label: "Easy", className: "bg-blue-50 text-blue-600 hover:bg-blue-100" },
];

const FlashcardViewer = ({ cards, onReview, onToggleFavorite }) => {
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);

  const card = cards[index];

  const goTo = (nextIndex) => {
    if (nextIndex < 0 || nextIndex >= cards.length) return;
    setIndex(nextIndex);
    setFlipped(false);
  };

  const handleGrade = (grade) => {
    onReview(card._id, grade);
    // Advance to the next card automatically — grading is the "done with
    // this one" action in a review session, not just a side-effect of flipping.
    goTo(index + 1);
  };

  useEffect(() => {
    const handler = (e) => {
      if (e.key === "ArrowLeft") goTo(index - 1);
      if (e.key === "ArrowRight") goTo(index + 1);
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
  }, [index, cards.length, flipped]);

  if (!card) return null;

  return (
    <div className="flex flex-col items-center">
      <div className="w-full max-w-xl">
        <div className="flex items-center justify-between mb-3">
          <span
            className={`text-xs font-semibold px-2.5 py-1 rounded-full ${DIFFICULTY_STYLES[card.difficulty] || DIFFICULTY_STYLES.medium}`}
          >
            {card.difficulty}
          </span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleFavorite(card._id);
            }}
            aria-label="Toggle favorite"
            className="text-gray-300 hover:text-amber-400"
          >
            <Star className={`w-5 h-5 ${card.isFavorite ? "fill-amber-400 text-amber-400" : ""}`} />
          </button>
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

      <div className="flex items-center gap-6 mt-6">
        <button
          onClick={() => goTo(index - 1)}
          disabled={index === 0}
          className="w-9 h-9 flex items-center justify-center rounded-lg border border-gray-200 text-gray-500 disabled:opacity-30 hover:bg-gray-50"
          aria-label="Previous"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="text-sm text-gray-600 font-medium">
          {index + 1} / {cards.length}
        </span>
        <button
          onClick={() => goTo(index + 1)}
          disabled={index === cards.length - 1}
          className="w-9 h-9 flex items-center justify-center rounded-lg border border-gray-200 text-gray-500 disabled:opacity-30 hover:bg-gray-50"
          aria-label="Next"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

export default FlashcardViewer;
