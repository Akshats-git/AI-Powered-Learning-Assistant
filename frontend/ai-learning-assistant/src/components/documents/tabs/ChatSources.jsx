import { useState } from "react";
import { BookOpen, ChevronDown, AlertTriangle } from "lucide-react";

// The citation and groundedness metadata a retrieval-augmented chat reply
// carries (see backend/utils/citations.js's toSources() and
// backend/utils/groundedness.js's verifyGroundedness()) — which excerpts the
// answer was grounded in, and whether a second pass found any claim that
// isn't actually supported by them. There's no pdf.js viewer yet (that's
// Phase 28), so a source isn't clickable-to-page yet — this is the
// "citations and groundedness are visible" step; "click a chip, jump to the
// page" comes once the reader does.
const formatPageRange = (page, endPage) => {
  if (page == null) return null;
  return page === endPage || endPage == null ? `p. ${page}` : `p. ${page}–${endPage}`;
};

const ChatSources = ({ sources, groundedness }) => {
  const [expanded, setExpanded] = useState(false);
  const hasSources = sources && sources.length > 0;
  // `grounded` is only ever explicitly false when verification actually ran
  // and found a problem — a missing groundedness object means "not checked,"
  // not "fine," so no warning is shown either way in that case.
  const hasWarning = groundedness && groundedness.grounded === false;

  if (!hasSources && !hasWarning) return null;

  return (
    <div className="mt-1.5 max-w-[75%] self-start space-y-1.5">
      {hasWarning && (
        <div className="flex items-start gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs text-amber-700">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">Some claims may not be fully supported by the document.</p>
            {groundedness.unsupportedClaims?.length > 0 && (
              <ul className="mt-1 list-disc list-inside space-y-0.5">
                {groundedness.unsupportedClaims.map((claim, i) => (
                  <li key={i}>{claim}</li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {hasSources && (
        <div>
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
      )}
    </div>
  );
};

export default ChatSources;
