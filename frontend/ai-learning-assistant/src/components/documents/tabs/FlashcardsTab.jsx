import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import moment from "moment";
import toast from "react-hot-toast";
import { Layers, Trash2 } from "lucide-react";

import { listFlashcardSetsForDocument, deleteFlashcardSet } from "../../../services/flashcardService";
import { generateFlashcards } from "../../../services/aiService";
import ConfirmDeleteModal from "../../ui/ConfirmDeleteModal";

const FlashcardsTab = ({ documentId }) => {
  const navigate = useNavigate();
  const [sets, setSets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const fetchSets = () => {
    setLoading(true);
    listFlashcardSetsForDocument(documentId)
      .then((res) => setSets(res.data))
      .finally(() => setLoading(false));
  };

  // fetchSets is also called imperatively after generate/delete, not just on mount/documentId change.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(fetchSets, [documentId]);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      await generateFlashcards(documentId, 10);
      toast.success("Flashcards generated");
      fetchSets();
    } catch {
      // error toast handled by the axios response interceptor
    } finally {
      setGenerating(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await deleteFlashcardSet(pendingDelete._id);
      toast.success("Flashcard set deleted");
      setSets((prev) => prev.filter((s) => s._id !== pendingDelete._id));
      setPendingDelete(null);
    } catch {
      // error toast handled by the axios response interceptor
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {[0, 1, 2].map((i) => (
          <div key={i} className="bg-white rounded-xl border border-gray-100 p-5 animate-pulse">
            <div className="h-4 w-32 bg-gray-100 rounded mb-2" />
            <div className="h-3 w-20 bg-gray-100 rounded" />
          </div>
        ))}
      </div>
    );
  }

  if (sets.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-100 p-12 flex flex-col items-center text-center">
        <div className="w-14 h-14 rounded-full bg-gray-50 flex items-center justify-center mb-4">
          <Layers className="w-6 h-6 text-gray-400" />
        </div>
        <p className="text-sm text-gray-500 mb-4">No flashcards yet for this document.</p>
        <button
          onClick={handleGenerate}
          disabled={generating}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium text-white bg-gradient-to-r from-primary to-primary-dark hover:opacity-90 disabled:opacity-60"
        >
          {generating ? "Generating..." : "Generate Flashcards"}
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-end mb-4">
        <button
          onClick={handleGenerate}
          disabled={generating}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white bg-gradient-to-r from-primary to-primary-dark hover:opacity-90 disabled:opacity-60"
        >
          {generating ? "Generating..." : "Generate Flashcards"}
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {sets.map((set) => (
          <div
            key={set._id}
            onClick={() => navigate(`/documents/${documentId}/flashcards?setId=${set._id}`)}
            className="cursor-pointer bg-white rounded-xl border border-gray-100 p-5 hover:shadow-md hover:border-gray-200 transition"
          >
            <div className="flex items-start justify-between">
              <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center mb-4">
                <Layers className="w-5 h-5" />
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setPendingDelete(set);
                }}
                className="text-gray-300 hover:text-red-500"
                aria-label="Delete set"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
            <h3 className="text-sm font-semibold text-gray-900 truncate">{set.title}</h3>
            <p className="text-xs text-gray-400 mt-1">
              {set.totalCards} cards · {moment(set.createdAt).fromNow()}
            </p>
          </div>
        ))}
      </div>

      {pendingDelete && (
        <ConfirmDeleteModal
          title="Delete flashcard set?"
          description={`"${pendingDelete.title}" and all its cards will be permanently deleted.`}
          onCancel={() => setPendingDelete(null)}
          onConfirm={handleDelete}
          deleting={deleting}
        />
      )}
    </div>
  );
};

export default FlashcardsTab;
