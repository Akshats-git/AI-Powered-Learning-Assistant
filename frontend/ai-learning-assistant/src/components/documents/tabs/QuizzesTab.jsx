import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import moment from "moment";
import toast from "react-hot-toast";
import { HelpCircle, Trash2 } from "lucide-react";

import { listQuizzesForDocument, deleteQuiz } from "../../../services/quizService";
import { generateQuiz } from "../../../services/aiService";
import Modal from "../../ui/Modal";
import ConfirmDeleteModal from "../../ui/ConfirmDeleteModal";

const GenerateQuizModal = ({ onClose, onGenerate, generating }) => {
  const [count, setCount] = useState(5);

  return (
    <Modal
      title="Generate Quiz"
      onClose={onClose}
      size="sm"
      footer={
        <div className="flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50">
            Cancel
          </button>
          <button
            onClick={() => onGenerate(count)}
            disabled={generating}
            className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-gradient-to-r from-primary to-primary-dark hover:opacity-90 disabled:opacity-60"
          >
            {generating ? "Generating..." : "Generate"}
          </button>
        </div>
      }
    >
      <label htmlFor="num-questions" className="block text-sm font-medium text-gray-700 mb-1.5">
        Number of Questions
      </label>
      <input
        id="num-questions"
        type="number"
        min={1}
        max={20}
        value={count}
        onChange={(e) => setCount(Number(e.target.value))}
        className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
      />
    </Modal>
  );
};

const QuizzesTab = ({ documentId }) => {
  const navigate = useNavigate();
  const [quizzes, setQuizzes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showGenerate, setShowGenerate] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const fetchQuizzes = () => {
    setLoading(true);
    listQuizzesForDocument(documentId)
      .then((res) => setQuizzes(res.data))
      .finally(() => setLoading(false));
  };

  useEffect(fetchQuizzes, [documentId]);

  const handleGenerate = async (count) => {
    setGenerating(true);
    try {
      await generateQuiz(documentId, count);
      toast.success("Quiz generated");
      setShowGenerate(false);
      fetchQuizzes();
    } catch {
      // error toast handled by the axios response interceptor
    } finally {
      setGenerating(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await deleteQuiz(pendingDelete._id);
      toast.success("Quiz deleted");
      setQuizzes((prev) => prev.filter((q) => q._id !== pendingDelete._id));
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

  return (
    <div>
      <div className="flex justify-end mb-4">
        <button
          onClick={() => setShowGenerate(true)}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white bg-gradient-to-r from-primary to-primary-dark hover:opacity-90"
        >
          Generate Quiz
        </button>
      </div>

      {quizzes.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 p-12 flex flex-col items-center text-center">
          <div className="w-14 h-14 rounded-full bg-gray-50 flex items-center justify-center mb-4">
            <HelpCircle className="w-6 h-6 text-gray-400" />
          </div>
          <p className="text-sm text-gray-500">No quizzes yet for this document.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {quizzes.map((quiz) => (
            <div key={quiz._id} className="bg-white rounded-xl border border-gray-100 p-5">
              <div className="flex items-start justify-between mb-4">
                <div className="w-10 h-10 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center">
                  <HelpCircle className="w-5 h-5" />
                </div>
                <div className="flex items-center gap-2">
                  {quiz.isCompleted && (
                    <span
                      className={`text-xs font-semibold px-2 py-1 rounded-full ${
                        quiz.score >= 60 ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-600"
                      }`}
                    >
                      {quiz.score}%
                    </span>
                  )}
                  <button
                    onClick={() => setPendingDelete(quiz)}
                    className="text-gray-300 hover:text-red-500"
                    aria-label="Delete quiz"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <h3 className="text-sm font-semibold text-gray-900 truncate">{quiz.title}</h3>
              <p className="text-xs text-gray-400 mt-1 mb-4">
                {quiz.questions.length} questions · {moment(quiz.createdAt).fromNow()}
              </p>
              <button
                onClick={() =>
                  navigate(quiz.isCompleted ? `/quizzes/${quiz._id}/results` : `/quizzes/${quiz._id}`)
                }
                className="w-full px-3 py-2 rounded-lg text-sm font-medium text-primary-dark bg-primary/10 hover:bg-primary/20"
              >
                {quiz.isCompleted ? "View Results" : "Start Quiz"}
              </button>
            </div>
          ))}
        </div>
      )}

      {showGenerate && (
        <GenerateQuizModal
          onClose={() => setShowGenerate(false)}
          onGenerate={handleGenerate}
          generating={generating}
        />
      )}

      {pendingDelete && (
        <ConfirmDeleteModal
          title="Delete quiz?"
          description={`"${pendingDelete.title}" will be permanently deleted.`}
          onCancel={() => setPendingDelete(null)}
          onConfirm={handleDelete}
          deleting={deleting}
        />
      )}
    </div>
  );
};

export default QuizzesTab;
