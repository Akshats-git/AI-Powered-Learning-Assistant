import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft, AlertTriangle } from "lucide-react";

import { getDocument } from "../../services/documentService";
import ContentTab from "../../components/documents/tabs/ContentTab";
import ChatTab from "../../components/documents/tabs/ChatTab";
import AIActionsTab from "../../components/documents/tabs/AIActionsTab";
import FlashcardsTab from "../../components/documents/tabs/FlashcardsTab";
import QuizzesTab from "../../components/documents/tabs/QuizzesTab";

const TABS = [
  { key: "content", label: "Content" },
  { key: "chat", label: "Chat" },
  { key: "ai-actions", label: "AI Actions" },
  { key: "flashcards", label: "Flashcards" },
  { key: "quizzes", label: "Quizzes" },
];

const DocumentDetailPage = () => {
  const { id } = useParams();
  const [document, setDocument] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("content");

  useEffect(() => {
    let ignore = false;

    // Resetting to a loading state when `id` changes (navigating between documents) is intentional.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    getDocument(id)
      .then((res) => {
        if (!ignore) setDocument(res.data);
      })
      .finally(() => {
        if (!ignore) setLoading(false);
      });

    return () => {
      ignore = true;
    };
  }, [id]);

  if (loading) {
    return <div className="h-40 bg-white rounded-xl border border-gray-100 animate-pulse" />;
  }

  if (!document) {
    return <p className="text-sm text-gray-500">Document not found.</p>;
  }

  return (
    <div>
      <Link to="/documents" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-4">
        <ArrowLeft className="w-4 h-4" />
        Back to Documents
      </Link>

      <h1 className="text-2xl font-bold text-gray-900 mb-4 truncate">{document.title}</h1>

      {document.hasExtractedText === false && (
        <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 mb-6 text-sm text-amber-800">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <p>
            No extractable text was found in this PDF (it's likely scanned or image-based). Chat,
            summaries, flashcards and quizzes won't work for this document.
          </p>
        </div>
      )}

      <div className="flex gap-6 border-b border-gray-200 mb-6 overflow-x-auto">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`pb-3 text-sm font-medium border-b-2 whitespace-nowrap transition ${
              activeTab === tab.key
                ? "border-primary text-primary-dark"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "content" && <ContentTab document={document} />}
      {activeTab === "chat" && <ChatTab documentId={document._id} />}
      {activeTab === "ai-actions" && <AIActionsTab documentId={document._id} />}
      {activeTab === "flashcards" && <FlashcardsTab documentId={document._id} />}
      {activeTab === "quizzes" && <QuizzesTab documentId={document._id} />}
    </div>
  );
};

export default DocumentDetailPage;
