import { useEffect, useState } from "react";
import { useParams, useSearchParams, useNavigate, Link } from "react-router-dom";
import toast from "react-hot-toast";
import { ArrowLeft, Trash2 } from "lucide-react";

import {
  getFlashcardSet,
  listFlashcardSetsForDocument,
  reviewCard,
  toggleFavoriteCard,
  deleteFlashcardSet,
} from "../../services/flashcardService";
import FlashcardViewer from "../../components/flashcards/FlashcardViewer";
import ConfirmDeleteModal from "../../components/ui/ConfirmDeleteModal";

const FlashcardPage = () => {
  const { id: documentId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const [set, setSet] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const setId = searchParams.get("setId");
    setLoading(true);
    setNotFound(false);

    const load = setId
      ? getFlashcardSet(setId)
      : listFlashcardSetsForDocument(documentId).then((res) => {
          if (res.data.length === 0) throw new Error("no sets");
          return getFlashcardSet(res.data[0]._id);
        });

    load
      .then((res) => setSet(res.data))
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documentId, searchParams]);

  const handleReview = async (cardId) => {
    setSet((prev) => ({
      ...prev,
      cards: prev.cards.map((c) => (c._id === cardId ? { ...c, isReviewed: true } : c)),
    }));
    try {
      await reviewCard(set._id, cardId);
    } catch {
      // error toast handled by the axios response interceptor
    }
  };

  const handleToggleFavorite = async (cardId) => {
    setSet((prev) => ({
      ...prev,
      cards: prev.cards.map((c) => (c._id === cardId ? { ...c, isFavorite: !c.isFavorite } : c)),
    }));
    try {
      await toggleFavoriteCard(set._id, cardId);
    } catch {
      // error toast handled by the axios response interceptor
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await deleteFlashcardSet(set._id);
      toast.success("Flashcard set deleted");
      navigate(`/documents/${documentId}`);
    } catch {
      setDeleting(false);
    }
  };

  if (loading) {
    return <div className="h-64 bg-white rounded-xl border border-gray-100 animate-pulse" />;
  }

  return (
    <div>
      <Link
        to={`/documents/${documentId}`}
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-4"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Document
      </Link>

      {notFound || !set ? (
        <p className="text-sm text-gray-500">No flashcard set found for this document.</p>
      ) : (
        <>
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-2xl font-bold text-gray-900 truncate">{set.title}</h1>
            <button
              onClick={() => setShowDelete(true)}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-red-500 hover:text-red-600"
            >
              <Trash2 className="w-4 h-4" />
              Delete Set
            </button>
          </div>

          <FlashcardViewer cards={set.cards} onReview={handleReview} onToggleFavorite={handleToggleFavorite} />
        </>
      )}

      {showDelete && (
        <ConfirmDeleteModal
          title="Delete flashcard set?"
          description={`"${set.title}" and all its cards will be permanently deleted.`}
          onCancel={() => setShowDelete(false)}
          onConfirm={handleDelete}
          deleting={deleting}
        />
      )}
    </div>
  );
};

export default FlashcardPage;
