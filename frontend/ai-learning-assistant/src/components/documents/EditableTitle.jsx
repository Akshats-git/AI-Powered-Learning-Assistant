import { useState } from "react";
import { Check, Pencil, X } from "lucide-react";
import toast from "react-hot-toast";

// The document title with an inline rename. `onSave(title)` should resolve to the saved title.
const EditableTitle = ({ title, onSave, readOnly = false }) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(title);
  const [saving, setSaving] = useState(false);

  const start = () => {
    setDraft(title);
    setEditing(true);
  };

  const save = async (e) => {
    e?.preventDefault();
    const next = draft.trim();
    if (!next) return toast.error("A title can't be empty");
    if (next === title) return setEditing(false);
    setSaving(true);
    try {
      await onSave(next);
      setEditing(false);
    } catch {
      // axiosInstance already toasts the server's message
    } finally {
      setSaving(false);
    }
  };

  if (editing) {
    return (
      <form onSubmit={save} onKeyDown={(e) => e.key === "Escape" && setEditing(false)} className="mb-4 flex items-center gap-2">
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          maxLength={200}
          aria-label="Document title"
          className="min-w-0 flex-1 rounded-lg border border-gray-200 px-3 py-1.5 text-xl font-bold text-gray-900 outline-none focus:border-primary focus:ring-2 focus:ring-primary/30"
        />
        <button type="submit" disabled={saving} aria-label="Save title" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-white bg-primary hover:bg-primary-dark disabled:opacity-60">
          <Check className="h-4 w-4" />
        </button>
        <button type="button" onClick={() => setEditing(false)} aria-label="Cancel rename" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50">
          <X className="h-4 w-4" />
        </button>
      </form>
    );
  }

  return (
    <div className="mb-4 flex items-center gap-2">
      <h1 className="min-w-0 truncate text-2xl font-bold text-gray-900">{title}</h1>
      {!readOnly && (
        <button type="button" onClick={start} aria-label="Rename document" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600">
          <Pencil className="h-4 w-4" />
        </button>
      )}
    </div>
  );
};

export default EditableTitle;
