import { useNavigate } from "react-router-dom";
import moment from "moment";
import { FileText, Layers, HelpCircle } from "lucide-react";
import { formatFileSize } from "../../utils/helpers";

const DocumentCard = ({ document }) => {
  const navigate = useNavigate();

  return (
    <button
      onClick={() => navigate(`/documents/${document._id}`)}
      className="text-left bg-white rounded-xl border border-gray-100 p-5 hover:shadow-md hover:border-gray-200 transition"
    >
      <div className="w-10 h-10 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center mb-4">
        <FileText className="w-5 h-5" />
      </div>

      <h3 className="text-sm font-semibold text-gray-900 truncate">{document.title}</h3>
      <p className="text-xs text-gray-400 mt-1">
        {formatFileSize(document.fileSize)} · {moment(document.createdAt).fromNow()}
      </p>

      <div className="flex items-center gap-2 mt-3">
        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-blue-50 text-blue-600 text-xs font-medium">
          <Layers className="w-3 h-3" />
          {document.flashcardCount ?? 0}
        </span>
        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-purple-50 text-purple-600 text-xs font-medium">
          <HelpCircle className="w-3 h-3" />
          {document.quizCount ?? 0}
        </span>
      </div>
    </button>
  );
};

export default DocumentCard;
