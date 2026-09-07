import { useEffect, useState } from "react";
import { Star, ChevronLeft, ChevronRight } from "lucide-react";

const DIFFICULTY_STYLES = {
  easy: "bg-emerald-50 text-emerald-600",
  medium: "bg-amber-50 text-amber-600",
  hard: "bg-red-50 text-red-600",
};

const FlashcardViewer = ({ cards, onReview, onToggleFavorite }) => {
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);

  const card = cards[index];

  useEffect(() => {
    const handler = (e) => {
      if (e.key === "ArrowLeft") goTo(index - 1);
      if (e.key === "ArrowRight") goTo(index + 1);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, cards.length]);

  const goTo = (nextIndex) => {
    if (nextIndex < 0 || nextIndex >= cards.length) return;
    setIndex(nextIndex);
    setFlipped(false);
  };

  const handleFlip = () => {
    const wasFlipped = flipped;
    setFlipped(!flipped);
    if (!wasFlipped && !card.isReviewed) {
      onReview(card._id);
    }
  };

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
          onClick={handleFlip}
          className={`w-full min-h-[260px] rounded-2xl p-8 flex items-center justify-center text-center shadow-sm transition-colors ${
            flipped ? "bg-gradient-to-br from-primary to-primary-dark text-white" : "bg-white border border-gray-100 text-gray-900"
          }`}
        >
          <p className="text-lg font-medium">{flipped ? card.answer : card.question}</p>
        </button>
        <p className="text-center text-xs text-gray-400 mt-2">Click the card to flip</p>
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
