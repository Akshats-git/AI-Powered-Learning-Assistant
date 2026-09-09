import { useState } from "react";
import { BookOpen, ChevronDown } from "lucide-react";

// The citation metadata a retrieval-augmented chat reply carries (see
// backend/utils/citations.js's toSources()) — which excerpts the answer was
// actually grounded in, independent of whether the model's prose mentioned a
// page number itself. There's no pdf.js viewer yet (that's Phase 28), so a
// source isn't clickable-to-page yet — this is the "citations exist and are
// visible" step; "click a chip, jump to the page" comes once the reader does.
const formatPageRange = (page, endPage) => {
  if (page == null) return null;
  return page === endPage || endPage == null ? `p. ${page}` : `p. ${page}–${endPage}`;
};

const ChatSources = ({ sources }) => {
  const [expanded, setExpanded] = useState(false);

  if (!sources || sources.length === 0) return null;

  return (
    <div className="mt-1.5 max-w-[75%] self-start">
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        aria-expanded={expanded}
        className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 transition-colors"
      >
        <BookOpen className="w-3 h-3" />
        {sources.length} source{sources.length === 1 ? "" : "s"}
        <ChevronDown className={`w-3 h-3 transition-transform ${expanded ? "rotate-180" : ""}`} />
      </button>

      {expanded && (
        <ul className="mt-1.5 space-y-1.5">
          {sources.map((source, i) => {
            const pageRange = formatPageRange(source.page, source.endPage);
            return (
              <li key={source.chunkId ?? i} className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-xs text-gray-600">
                <div className="flex flex-wrap items-center gap-1.5 font-medium text-gray-500">
                  {pageRange && <span className="rounded bg-primary/10 px-1.5 py-0.5 text-primary">{pageRange}</span>}
                  {source.sectionPath?.length > 0 && <span>{source.sectionPath.join(" > ")}</span>}
                </div>
                <p className="mt-1 text-gray-500">{source.snippet}</p>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

export default ChatSources;
