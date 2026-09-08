import { useEffect, useState } from "react";
import { Plus, FileText } from "lucide-react";

import { listDocuments } from "../../services/documentService";
import DocumentCard from "../../components/documents/DocumentCard";
import UploadModal from "../../components/documents/UploadModal";

const CardSkeleton = () => (
  <div className="bg-white rounded-xl border border-gray-100 p-5 animate-pulse">
    <div className="w-10 h-10 rounded-lg bg-gray-100 mb-4" />
    <div className="h-4 w-32 bg-gray-100 rounded mb-2" />
    <div className="h-3 w-20 bg-gray-100 rounded" />
  </div>
);

const DocumentListPage = () => {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showUpload, setShowUpload] = useState(false);

  const fetchDocuments = () => {
    setLoading(true);
    listDocuments()
      .then((res) => setDocuments(res.data))
      .finally(() => setLoading(false));
  };

  // One-time fetch on mount; loading is already true from useState's initial value.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(fetchDocuments, []);

  const handleUploaded = (doc) => {
    setDocuments((prev) => [{ ...doc, flashcardCount: 0, quizCount: 0 }, ...prev]);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Documents</h1>
          <p className="text-sm text-gray-500 mt-1">Upload PDFs and turn them into study material.</p>
        </div>
        <button
          onClick={() => setShowUpload(true)}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium text-white bg-gradient-to-r from-primary to-primary-dark hover:opacity-90 transition"
        >
          <Plus className="w-4 h-4" />
          Upload Document
        </button>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[0, 1, 2].map((i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
      ) : documents.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 p-12 flex flex-col items-center text-center">
          <div className="w-14 h-14 rounded-full bg-gray-50 flex items-center justify-center mb-4">
            <FileText className="w-6 h-6 text-gray-400" />
          </div>
          <p className="text-sm text-gray-500 mb-4">No documents yet. Upload your first PDF to get started.</p>
          <button
            onClick={() => setShowUpload(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium text-white bg-gradient-to-r from-primary to-primary-dark hover:opacity-90"
          >
            <Plus className="w-4 h-4" />
            Upload Document
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {documents.map((doc) => (
            <DocumentCard key={doc._id} document={doc} />
          ))}
        </div>
      )}

      {showUpload && <UploadModal onClose={() => setShowUpload(false)} onUploaded={handleUploaded} />}
    </div>
  );
};

export default DocumentListPage;
