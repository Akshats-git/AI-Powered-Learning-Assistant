import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";

import { getQuiz, submitQuiz } from "../../services/quizService";
import Modal from "../../components/ui/Modal";

const QuizTakePage = () => {
  const { id } = useParams();
  const navigate = useNavigate();

  const [quiz, setQuiz] = useState(null);
  const [loading, setLoading] = useState(true);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  useEffect(() => {
    getQuiz(id)
      .then((res) => setQuiz(res.data))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return <div className="h-64 bg-white rounded-xl border border-gray-100 animate-pulse" />;
  }

  if (!quiz) {
    return <p className="text-sm text-gray-500">Quiz not found.</p>;
  }

  const total = quiz.questions.length;
  const answeredCount = Object.keys(answers).length;
  const question = quiz.questions[index];
  const isLast = index === total - 1;

  const selectOption = (option) => {
    setAnswers((prev) => ({ ...prev, [index]: option }));
  };

  const doSubmit = async () => {
    setSubmitting(true);
    try {
      const answerPairs = quiz.questions.map((q, i) => ({ questionId: q._id, answer: answers[i] ?? null }));
      await submitQuiz(id, answerPairs);
      navigate(`/quizzes/${id}/results`);
    } catch {
      setSubmitting(false);
    }
  };

  const handleSubmitClick = () => {
    if (answeredCount < total) {
      setShowConfirm(true);
    } else {
      doSubmit();
    }
  };

  return (
    <div>
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-lg font-bold text-gray-900 truncate">{quiz.title}</h1>
          <span className="text-sm text-gray-500 shrink-0 ml-3">
            Question {index + 1} of {total} · {answeredCount} answered
          </span>
        </div>
        <div className="w-full h-1.5 rounded-full bg-gray-100 overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-primary to-primary-dark transition-all"
            style={{ width: `${((index + 1) / total) * 100}%` }}
          />
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 p-6 mb-6">
        <p className="text-base font-medium text-gray-900 mb-5">{question.question}</p>

        <div className="space-y-2.5">
          {question.options.map((option) => (
            <button
              key={option}
              onClick={() => selectOption(option)}
              className={`w-full text-left px-4 py-3 rounded-lg border text-sm transition ${
                answers[index] === option
                  ? "border-primary bg-primary/5 text-primary-dark font-medium"
                  : "border-gray-200 text-gray-700 hover:bg-gray-50"
              }`}
            >
              {option}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-6">
        {quiz.questions.map((_, i) => (
          <button
            key={i}
            onClick={() => setIndex(i)}
            className={`w-8 h-8 rounded-lg text-xs font-medium border transition ${
              i === index
                ? "border-primary text-primary-dark"
                : answers[i] !== undefined
                ? "border-transparent bg-primary/10 text-primary-dark"
                : "border-gray-200 text-gray-400"
            }`}
          >
            {i + 1}
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between">
        <button
          onClick={() => setIndex((i) => Math.max(0, i - 1))}
          disabled={index === 0}
          className="px-4 py-2.5 rounded-lg text-sm font-medium text-gray-600 border border-gray-200 disabled:opacity-40 hover:bg-gray-50"
        >
          Previous
        </button>

        {isLast ? (
          <button
            onClick={handleSubmitClick}
            disabled={submitting}
            className="px-5 py-2.5 rounded-lg text-sm font-medium text-white bg-gradient-to-r from-primary to-primary-dark hover:opacity-90 disabled:opacity-60"
          >
            {submitting ? "Submitting..." : "Submit Quiz"}
          </button>
        ) : (
          <button
            onClick={() => setIndex((i) => Math.min(total - 1, i + 1))}
            className="px-5 py-2.5 rounded-lg text-sm font-medium text-white bg-gradient-to-r from-primary to-primary-dark hover:opacity-90"
          >
            Next
          </button>
        )}
      </div>

      {showConfirm && (
        <Modal
          title="Unanswered questions"
          onClose={() => setShowConfirm(false)}
          size="sm"
          footer={
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowConfirm(false)}
                className="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50"
              >
                Keep answering
              </button>
              <button
                onClick={doSubmit}
                disabled={submitting}
                className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-gradient-to-r from-primary to-primary-dark hover:opacity-90 disabled:opacity-60"
              >
                {submitting ? "Submitting..." : "Submit anyway"}
              </button>
            </div>
          }
        >
          <p className="text-sm text-gray-500">
            You've answered {answeredCount} of {total} questions. Unanswered questions will be marked incorrect.
          </p>
        </Modal>
      )}
    </div>
  );
};

export default QuizTakePage;
