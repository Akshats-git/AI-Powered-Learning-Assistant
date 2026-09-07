import { useState } from "react";
import { Sparkles, MessageCircleQuestion } from "lucide-react";

import { getSummary, explainConcept } from "../../../services/aiService";
import MarkdownModal from "../../ui/MarkdownModal";

const AIActionsTab = ({ documentId }) => {
  const [concept, setConcept] = useState("");
  const [summarizing, setSummarizing] = useState(false);
  const [explaining, setExplaining] = useState(false);
  const [modal, setModal] = useState(null); // { title, content, loading }

  const handleSummarize = async () => {
    setModal({ title: "Summary", content: "", loading: true });
    setSummarizing(true);
    try {
      const res = await getSummary(documentId);
      setModal({ title: "Summary", content: res.data.summary, loading: false });
    } catch {
      setModal(null);
    } finally {
      setSummarizing(false);
    }
  };

  const handleExplain = async (e) => {
    e.preventDefault();
    if (!concept.trim()) return;

    setModal({ title: `Explaining "${concept}"`, content: "", loading: true });
    setExplaining(true);
    try {
      const res = await explainConcept(documentId, concept.trim());
      setModal({ title: `Explaining "${concept}"`, content: res.data.explanation, loading: false });
    } catch {
      setModal(null);
    } finally {
      setExplaining(false);
    }
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <div className="bg-white rounded-xl border border-gray-100 p-5">
        <div className="w-10 h-10 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center mb-4">
          <Sparkles className="w-5 h-5" />
        </div>
        <h3 className="text-sm font-semibold text-gray-900 mb-1">Generate Summary</h3>
        <p className="text-xs text-gray-500 mb-4">Get a concise, structured summary of this document.</p>
        <button
          onClick={handleSummarize}
          disabled={summarizing}
          className="w-full px-4 py-2.5 rounded-lg text-sm font-medium text-white bg-gradient-to-r from-primary to-primary-dark hover:opacity-90 disabled:opacity-60"
        >
          {summarizing ? "Summarizing..." : "Summarize"}
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 p-5">
        <div className="w-10 h-10 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center mb-4">
          <MessageCircleQuestion className="w-5 h-5" />
        </div>
        <h3 className="text-sm font-semibold text-gray-900 mb-1">Explain a Concept</h3>
        <p className="text-xs text-gray-500 mb-4">Ask for a clear explanation of any concept in the document.</p>
        <form onSubmit={handleExplain} className="flex gap-2">
          <input
            type="text"
            value={concept}
            onChange={(e) => setConcept(e.target.value)}
            placeholder="e.g. mitosis"
            className="flex-1 px-3 py-2.5 rounded-lg border border-gray-200 text-sm outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
          />
          <button
            type="submit"
            disabled={explaining || !concept.trim()}
            className="px-4 py-2.5 rounded-lg text-sm font-medium text-white bg-gradient-to-r from-primary to-primary-dark hover:opacity-90 disabled:opacity-60"
          >
            {explaining ? "..." : "Explain"}
          </button>
        </form>
      </div>

      {modal && (
        <MarkdownModal
          title={modal.title}
          content={modal.content}
          loading={modal.loading}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
};

export default AIActionsTab;
