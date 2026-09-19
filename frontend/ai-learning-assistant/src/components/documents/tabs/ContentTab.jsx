import { ExternalLink } from "lucide-react";

// `page` (optional) opens the viewer on that page — used when a chat citation is clicked.
// The browser's built-in PDF viewer honours a #page=N fragment.
const ContentTab = ({ document, page = null }) => {
  const fileUrl = `${import.meta.env.VITE_API_BASE_URL}${document.fileUrl}`;

  return (
    <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100">
        <span className="text-xs text-gray-500">{page ? `Showing page ${page}` : ""}</span>
        <a
          href={fileUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
        >
          Open in new tab <ExternalLink className="w-3.5 h-3.5" />
        </a>
      </div>
      {/* Keyed by page: changing only the #fragment doesn't make a PDF viewer scroll, remounting does. */}
      <iframe key={page ?? "top"} title={document.title} src={page ? `${fileUrl}#page=${page}` : fileUrl} className="w-full h-[75vh]" />
    </div>
  );
};

export default ContentTab;
