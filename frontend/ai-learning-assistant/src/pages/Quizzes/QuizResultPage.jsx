import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { Trophy, CheckCircle2, XCircle, ArrowLeft } from "lucide-react";

import { getQuizResults } from "../../services/quizService";

const ENCOURAGEMENT = (pct) => {
  if (pct >= 90) return "Outstanding work!";
  if (pct >= 70) return "Great job!";
  if (pct >= 50) return "Good effort — keep practicing.";
  return "Don't worry, review the material and try again.";
};

const QuizResultPage = () => {
  const { id } = useParams();
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notReady, setNotReady] = useState(false);

  useEffect(() => {
    getQuizResults(id)
      .then((res) => setResults(res.data))
      .catch(() => setNotReady(true))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return <div className="h-64 bg-white rounded-xl border border-gray-100 animate-pulse" />;
  }

  if (notReady || !results) {
    return (
      <div className="text-center">
        <p className="text-sm text-gray-500 mb-3">This quiz hasn't been submitted yet.</p>
        <Link to={`/quizzes/${id}`} className="text-primary font-medium hover:underline text-sm">
          Take the quiz
        </Link>
      </div>
    );
  }

  const passed = results.percentage >= 60;

  return (
    <div>
      <div className="bg-white rounded-xl border border-gray-100 p-8 text-center mb-6">
        <div
          className={`w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center ${
            passed ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-600"
          }`}
        >
          <Trophy className="w-8 h-8" />
        </div>
        <p className={`text-4xl font-bold mb-1 ${passed ? "text-emerald-600" : "text-red-600"}`}>
          {results.percentage}%
        </p>
        <p className="text-sm text-gray-500 mb-6">{ENCOURAGEMENT(results.percentage)}</p>

        <div className="flex items-center justify-center gap-3">
          <span className="px-3 py-1.5 rounded-full bg-gray-50 text-gray-600 text-xs font-medium">
            Total: {results.total}
          </span>
          <span className="px-3 py-1.5 rounded-full bg-emerald-50 text-emerald-600 text-xs font-medium">
            Correct: {results.correct}
          </span>
          <span className="px-3 py-1.5 rounded-full bg-red-50 text-red-600 text-xs font-medium">
            Incorrect: {results.incorrect}
          </span>
        </div>
      </div>

      <div className="space-y-4 mb-6">
        {results.questions.map((q, i) => (
          <div key={i} className="bg-white rounded-xl border border-gray-100 p-5">
            <p className="text-sm font-medium text-gray-900 mb-3">
              {i + 1}. {q.question}
            </p>

            <div className="space-y-1.5 mb-3">
              {q.options.map((option) => {
                const isUser = option === q.userAnswer;
                const isCorrectOption = option === q.correctAnswer;
                let style = "border-gray-200 text-gray-600";
                if (isCorrectOption) style = "border-emerald-200 bg-emerald-50 text-emerald-700";
                else if (isUser && !q.isCorrect) style = "border-red-200 bg-red-50 text-red-700";

                return (
                  <div key={option} className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm ${style}`}>
                    {isCorrectOption && <CheckCircle2 className="w-4 h-4 shrink-0" />}
                    {isUser && !q.isCorrect && <XCircle className="w-4 h-4 shrink-0" />}
                    {option}
                  </div>
                );
              })}
            </div>

            {q.explanation && (
              <p className="text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2">{q.explanation}</p>
            )}
          </div>
        ))}
      </div>

      {results.document && (
        <Link
          to={`/documents/${results.document}`}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
        >
          <ArrowLeft className="w-4 h-4" />
          Return to Document
        </Link>
      )}
    </div>
  );
};

export default QuizResultPage;
