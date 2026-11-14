import { useEffect, useState } from "react";
import { ExternalLink, FileWarning } from "lucide-react";
import { fetchDocumentFile } from "../../../services/documentService";

// The PDF sits behind auth (GET /api/documents/:id/file), and an <iframe> can't
// send a bearer token — so fetch it over XHR (which also gets the silent token
// refresh for free) and show it from a same-origin blob: URL.
const usePdfBlobUrl = (document) => {
  const [state, setState] = useState({ url: null, error: false });
  const skip = !document.fileUrl || document.fileMissing;

  useEffect(() => {
    if (skip) return undefined;
    let objectUrl = null;
    let cancelled = false;
    fetchDocumentFile(document.fileUrl)
      .then((res) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(new Blob([res.data], { type: "application/pdf" }));
        setState({ url: objectUrl, error: false });
      })
      .catch(() => {
        if (!cancelled) setState({ url: null, error: true });
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      setState({ url: null, error: false });
    };
  }, [document.fileUrl, skip]);

  return skip ? { url: null, error: false } : state;
};

// `page` (optional) opens the viewer on that page — used when a chat citation is clicked.
// The browser's built-in PDF viewer honours a #page=N fragment.
const ContentTab = ({ document, page = null }) => {
  const { url, error } = usePdfBlobUrl(document);

  let body;
  if (document.fileMissing || error) {
    body = (
      <div className="flex h-[40vh] flex-col items-center justify-center gap-2 px-6 text-center text-sm text-gray-500">
        <FileWarning className="h-6 w-6 text-gray-400" />
        <p>The PDF preview couldn&apos;t be loaded.</p>
      </div>
    );
  } else if (!url) {
    body = (
      <div className="flex h-[75vh] items-center justify-center" role="status" aria-live="polite">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-200 border-t-primary motion-reduce:animate-none" />
        <span className="sr-only">Loading PDF</span>
      </div>
    );
  } else {
    // Keyed by page: changing only the #fragment doesn't make a PDF viewer scroll, remounting does.
    body = <iframe key={page ?? "top"} title={document.title} src={page ? `${url}#page=${page}` : url} className="w-full h-[75vh]" />;
  }

  return (
    <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100">
        <span className="text-xs text-gray-500">{page ? `Showing page ${page}` : ""}</span>
        {url && (
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 py-2.5 -my-2.5 text-xs font-medium text-primary hover:underline"
          >
            Open in new tab <ExternalLink className="w-3.5 h-3.5" />
          </a>
        )}
      </div>
      {body}
    </div>
  );
};

export default ContentTab;
