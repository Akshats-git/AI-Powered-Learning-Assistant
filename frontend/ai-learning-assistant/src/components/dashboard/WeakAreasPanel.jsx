import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Target, Layers, HelpCircle } from "lucide-react";
import toast from "react-hot-toast";

import { getMastery } from "../../services/masteryService";
import { generateFlashcards, generateQuiz } from "../../services/aiService";

const PRACTICE_CARDS = 8;
const PRACTICE_QUESTIONS = 5;

// "A real weak areas panel driven by inference, not counting" — each bar is
// a Bayesian Knowledge Tracing estimate (backend/utils/bkt.js) built up from
// every quiz answer tagged with that concept, not just a raw wrong-answer
// count. Only shows up once there's at least one BKT-tracked concept, which
// needs a quiz whose questions were generated with the concept tag (shipped
// alongside this panel — older quizzes won't have one until regenerated).
const WeakAreasPanel = () => {
  const [weakest, setWeakest] = useState(null);
  const [busy, setBusy] = useState(null); // "<concept>:<kind>" while generating
  const navigate = useNavigate();

  useEffect(() => {
    getMastery()
      .then((res) => setWeakest(res.data.weakest))
      .catch(() => setWeakest([]));
  }, []);

  // "You keep missing X — generate cards on just that": the server retrieves the
  // chunks about this concept and drills only it.
  const practice = async (item, kind) => {
    const key = `${item.concept}:${kind}`;
    if (busy) return;
    setBusy(key);
    try {
      if (kind === "cards") {
        const res = await generateFlashcards(item.documentId, PRACTICE_CARDS, item.concept);
        toast.success(`Flashcards on "${item.concept}" are ready`);
        navigate(`/documents/${item.documentId}/flashcards?setId=${res.data._id}`);
      } else {
        const res = await generateQuiz(item.documentId, PRACTICE_QUESTIONS, item.concept);
        toast.success(`Quiz on "${item.concept}" is ready`);
        navigate(`/quizzes/${res.data._id}`);
      }
    } catch {
      // error toast handled by the axios response interceptor
    } finally {
      setBusy(null);
    }
  };

  if (weakest === null) {
    return <div className="bg-white rounded-xl border border-gray-100 p-5 h-48 animate-pulse" />;
  }

  if (weakest.length === 0) return null;

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-5">
      <div className="flex items-center gap-2 mb-4">
        <Target className="w-4 h-4 text-primary" />
        <h2 className="text-sm font-semibold text-gray-800">Weak Areas</h2>
      </div>

      <ul className="space-y-3">
        {weakest.map((item) => (
          <li key={`${item.documentId}-${item.concept}`}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm text-gray-700 truncate">{item.concept}</span>
              <span className="text-xs text-gray-400 shrink-0 ml-2">{Math.round(item.pKnown * 100)}%</span>
            </div>
            <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-amber-400 to-red-400"
                style={{ width: `${Math.round(item.pKnown * 100)}%` }}
              />
            </div>
            <div className="mt-2 flex gap-2">
              {[["cards", "Flashcards", Layers], ["quiz", "Quiz", HelpCircle]].map(([kind, label, Icon]) => (
                <button
                  key={kind}
                  onClick={() => practice(item, kind)}
                  disabled={busy !== null}
                  aria-label={`Practice ${item.concept} with ${label.toLowerCase()}`}
                  className="inline-flex items-center gap-1 rounded-md border border-gray-200 px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                >
                  <Icon className="w-3 h-3" />
                  {busy === `${item.concept}:${kind}` ? "Generating..." : label}
                </button>
              ))}
            </div>
            {item.documentTitle && (
              <Link
                to={`/documents/${item.documentId}`}
                className="text-xs text-primary hover:underline mt-1 inline-block"
              >
                {item.documentTitle}
              </Link>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
};

export default WeakAreasPanel;
