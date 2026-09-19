import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, LayoutDashboard, FileText, Flame, Layers, HelpCircle, User, MessageSquare } from "lucide-react";

import { searchAll } from "../../services/searchService";
import { fuzzyFilter } from "../../utils/fuzzy";

const COMMANDS = [
  { id: "cmd-dashboard", label: "Go to Dashboard", to: "/dashboard", icon: LayoutDashboard },
  { id: "cmd-documents", label: "Go to Documents", to: "/documents", icon: FileText },
  { id: "cmd-review", label: "Start a review session", to: "/review", icon: Flame },
  { id: "cmd-flashcards", label: "Go to Flashcards", to: "/flashcards", icon: Layers },
  { id: "cmd-quizzes", label: "Go to Quizzes", to: "/quizzes", icon: HelpCircle },
  { id: "cmd-profile", label: "Go to Profile", to: "/profile", icon: User },
];

const DEBOUNCE_MS = 200;
const MIN_QUERY = 2;

// Turns the API's grouped response into flat, navigable rows.
const rowsFromResults = (r) => [
  ...r.documents.map((d) => ({ id: `doc-${d.id}`, group: "Documents", label: d.title, to: `/documents/${d.id}`, icon: FileText })),
  ...r.flashcards.map((f) => ({ id: `fc-${f.id}`, group: "Flashcards", label: f.title, hint: f.card?.snippet, to: `/documents/${f.documentId}/flashcards?setId=${f.id}`, icon: Layers })),
  ...r.quizzes.map((z) => ({ id: `qz-${z.id}`, group: "Quizzes", label: z.title, hint: z.question, to: z.isCompleted ? `/quizzes/${z.id}/results` : `/quizzes/${z.id}`, icon: HelpCircle })),
  ...r.chats.map((c) => ({ id: `chat-${c.documentId}`, group: "Chat", label: c.documentTitle, hint: c.snippet, to: `/documents/${c.documentId}?tab=chat`, icon: MessageSquare })),
];

/**
 * Ctrl/Cmd+K palette: jump anywhere in the app, or search your documents, decks,
 * quizzes and chats. A WAI-ARIA combobox — focus stays in the input while the
 * arrow keys move a highlighted option, which a screen reader announces.
 */
const CommandPalette = ({ open, onClose }) => {
  const navigate = useNavigate();
  const listId = useId();
  const inputRef = useRef(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [failed, setFailed] = useState(false);
  const [active, setActive] = useState(0);
  const latest = useRef(0); // ignores a slow response that arrives after a newer query's

  // Reset each time it opens.
  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setQuery("");
    setResults([]);
    setFailed(false);
    setActive(0);
    inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    const term = query.trim();
    if (!open || term.length < MIN_QUERY) {
      latest.current += 1; // invalidate anything in flight
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setResults([]);
      setSearching(false);
      return undefined;
    }

    const controller = new AbortController();
    const ticket = (latest.current += 1);
    setSearching(true);
    const timer = setTimeout(() => {
      searchAll(term, { signal: controller.signal })
        .then((res) => {
          if (ticket !== latest.current) return;
          setResults(rowsFromResults(res.data));
          setFailed(false);
        })
        .catch((err) => {
          if (ticket === latest.current && err.name !== "CanceledError") setFailed(true);
        })
        .finally(() => {
          if (ticket === latest.current) setSearching(false);
        });
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, open]);

  const commands = useMemo(() => fuzzyFilter(COMMANDS, query, (c) => c.label).map((c) => ({ ...c, group: "Go to" })), [query]);
  const rows = useMemo(() => [...commands, ...results], [commands, results]);

  // Keep the highlight in range as the list changes under it.
  const current = Math.min(active, Math.max(0, rows.length - 1));

  if (!open) return null;

  const choose = (row) => {
    if (!row) return;
    onClose();
    navigate(row.to);
  };

  const onKeyDown = (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive(rows.length ? (current + 1) % rows.length : 0);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive(rows.length ? (current - 1 + rows.length) % rows.length : 0);
    } else if (e.key === "Home") {
      setActive(0);
    } else if (e.key === "End") {
      setActive(Math.max(0, rows.length - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      choose(rows[current]);
    } else if (e.key === "Tab") {
      e.preventDefault(); // the input is the only stop; arrows move within the list
    }
  };

  let lastGroup = null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-[12vh]">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden="true" />
      <div role="dialog" aria-modal="true" aria-label="Command palette" className="relative w-full max-w-xl overflow-hidden rounded-2xl bg-white shadow-xl" onKeyDown={onKeyDown}>
        <div className="flex items-center gap-3 border-b border-gray-100 px-4">
          <Search className="h-4 w-4 shrink-0 text-gray-400" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-activedescendant={rows[current] ? `${listId}-${rows[current].id}` : undefined}
            aria-label="Search or jump to"
            placeholder="Search documents, decks, quizzes, chats… or jump to a page"
            className="h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-gray-400"
          />
          <kbd className="hidden rounded border border-gray-200 px-1.5 py-0.5 text-[10px] text-gray-400 sm:block">Esc</kbd>
        </div>

        <ul id={listId} role="listbox" aria-label="Results" className="max-h-[50vh] overflow-y-auto py-2">
          {rows.map((row, i) => {
            const header = row.group !== lastGroup ? row.group : null;
            lastGroup = row.group;
            const Icon = row.icon;
            return (
              <li key={row.id} role="presentation">
                {header && <p className="px-4 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-gray-400">{header}</p>}
                <div
                  id={`${listId}-${row.id}`}
                  role="option"
                  aria-selected={i === current}
                  onMouseMove={() => setActive(i)}
                  onClick={() => choose(row)}
                  className={`mx-2 flex cursor-pointer items-start gap-3 rounded-lg px-2.5 py-2 text-sm ${i === current ? "bg-primary/10 text-primary-dark" : "text-gray-700"}`}
                >
                  <Icon className="mt-0.5 h-4 w-4 shrink-0" />
                  <span className="min-w-0">
                    <span className="block truncate">{row.label}</span>
                    {row.hint && <span className="block truncate text-xs text-gray-400">{row.hint}</span>}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>

        {/* Status line: announced politely, never steals focus. */}
        <p role="status" aria-live="polite" className="border-t border-gray-100 px-4 py-2 text-xs text-gray-400">
          {failed
            ? "Search is unavailable right now."
            : searching
              ? "Searching…"
              : query.trim().length >= MIN_QUERY && results.length === 0
                ? `No documents, decks, quizzes or chats match "${query.trim()}".`
                : "↑↓ to move · Enter to open · Esc to close"}
        </p>
      </div>
    </div>
  );
};

export default CommandPalette;
