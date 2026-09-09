import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import moment from "moment";
import { HelpCircle, CheckCircle2 } from "lucide-react";

import { listQuizzes } from "../../services/quizService";

const CardSkeleton = () => (
  <div className="bg-white rounded-xl border border-gray-100 p-5 animate-pulse">
    <div className="h-4 w-32 bg-gray-100 rounded mb-2" />
    <div className="h-3 w-20 bg-gray-100 rounded mb-4" />
    <div className="h-2 w-full bg-gray-100 rounded" />
  </div>
);

const PAGE_SIZE = 12;

const QuizzesListPage = () => {
  const navigate = useNavigate();
  const [quizzes, setQuizzes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const fetchQuizzes = (pageNum = 1) => {
    const isFirstPage = pageNum === 1;
    if (isFirstPage) setLoading(true);
    else setLoadingMore(true);

    listQuizzes({ page: pageNum, limit: PAGE_SIZE })
      .then((res) => {
        setQuizzes((prev) => (isFirstPage ? res.data.items : [...prev, ...res.data.items]));
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
  useEffect(fetchQuizzes, []);

  const goToQuiz = (quiz) => navigate(quiz.isCompleted ? `/quizzes/${quiz._id}/results` : `/quizzes/${quiz._id}`);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">All Quizzes</h1>
        <p className="text-sm text-gray-500 mt-1">Quizzes generated from your documents.</p>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[0, 1, 2].map((i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
      ) : quizzes.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 p-12 flex flex-col items-center text-center">
          <div className="w-14 h-14 rounded-full bg-gray-50 flex items-center justify-center mb-4">
            <HelpCircle className="w-6 h-6 text-gray-400" />
          </div>
          <p className="text-sm text-gray-500">
            No quizzes yet. Open a document and generate one to get started.
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {quizzes.map((quiz) => (
              <button
                key={quiz._id}
                onClick={() => goToQuiz(quiz)}
                className="text-left bg-white rounded-xl border border-gray-100 p-5 hover:shadow-md hover:border-gray-200 transition"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="w-10 h-10 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center">
                    <HelpCircle className="w-5 h-5" />
                  </div>
                  {quiz.isCompleted && (
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-emerald-50 text-emerald-600 text-xs font-medium">
                      <CheckCircle2 className="w-3 h-3" />
                      {quiz.score}%
                    </span>
                  )}
                </div>

                <h3 className="text-sm font-semibold text-gray-900 truncate">{quiz.title}</h3>
                <p className="text-xs text-gray-400 mt-1 truncate">{quiz.document?.title}</p>
                <p className="text-xs text-gray-400 mt-1">
                  {quiz.questionCount} questions · {moment(quiz.createdAt).fromNow()}
                </p>
              </button>
            ))}
          </div>

          {page < totalPages && (
            <div className="flex justify-center mt-6">
              <button
                onClick={() => fetchQuizzes(page + 1)}
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

export default QuizzesListPage;
