import { ExternalLink } from "lucide-react";

const ContentTab = ({ document }) => {
  const fileUrl = `${import.meta.env.VITE_API_BASE_URL}${document.fileUrl}`;

  return (
    <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
      <div className="flex items-center justify-end px-4 py-2.5 border-b border-gray-100">
        <a
          href={fileUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
        >
          Open in new tab <ExternalLink className="w-3.5 h-3.5" />
        </a>
      </div>
      <iframe title={document.title} src={fileUrl} className="w-full h-[75vh]" />
    </div>
  );
};

export default ContentTab;
