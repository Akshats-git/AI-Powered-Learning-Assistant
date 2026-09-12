import { useState } from "react";
import toast from "react-hot-toast";
import { KeyRound, ShieldCheck } from "lucide-react";

import { useAuth } from "../../hooks/useAuth";
import { saveApiKey, removeApiKey } from "../../services/authService";
import ConfirmDeleteModal from "../ui/ConfirmDeleteModal";

const ApiKeySettings = () => {
  const { user, updateUser } = useAuth();
  const [apiKey, setApiKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [confirmingRemove, setConfirmingRemove] = useState(false);

  const hasOwnKey = Boolean(user?.openaiApiKeyLast4);

  const handleSave = async (e) => {
    e.preventDefault();
    if (!apiKey.trim()) return;

    setSaving(true);
    try {
      const res = await saveApiKey(apiKey.trim());
      updateUser({ openaiApiKeyLast4: res.data.openaiApiKeyLast4 });
      setApiKey("");
      toast.success("API key saved");
    } catch {
      // error toast handled by the axios response interceptor
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async () => {
    setRemoving(true);
    try {
      await removeApiKey();
      updateUser({ openaiApiKeyLast4: null });
      toast.success("API key removed");
      setConfirmingRemove(false);
    } catch {
      // error toast handled by the axios response interceptor
    } finally {
      setRemoving(false);
    }
  };

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-6">
      <h2 className="text-sm font-semibold text-gray-800 mb-1">OpenAI API Key</h2>
      <p className="text-xs text-gray-500 mb-4">
        {user?.aiSharedKeyConfigured
          ? "AI features work out of the box using this app's shared key, with a monthly usage cap. Add your own key for unlimited use funded by your own OpenAI account."
          : "This app has no shared key configured — add your own OpenAI API key to use chat, summaries, flashcards, and quizzes."}{" "}
        Get one at{" "}
        <a
          href="https://platform.openai.com/api-keys"
          target="_blank"
          rel="noreferrer"
          className="text-primary hover:underline"
        >
          platform.openai.com/api-keys
        </a>
        . It's encrypted at rest and never shown again after you save it.
      </p>

      {hasOwnKey ? (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-gray-100 px-4 py-3">
          <div className="flex items-center gap-3 min-w-0">
            <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
            <p className="text-sm text-gray-700">
              Using your own key, ending in <span className="font-mono">{user.openaiApiKeyLast4}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={() => setConfirmingRemove(true)}
            className="text-xs font-medium text-red-500 hover:text-red-600 shrink-0"
          >
            Remove
          </button>
        </div>
      ) : (
        <form onSubmit={handleSave} className="flex items-start gap-3">
          <div className="relative flex-1">
            <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-..."
              autoComplete="off"
              className="w-full pl-10 pr-3 py-2.5 rounded-lg border border-gray-200 text-sm outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
            />
          </div>
          <button
            type="submit"
            disabled={saving || !apiKey.trim()}
            className="px-5 py-2.5 rounded-lg text-sm font-medium text-white bg-gradient-to-r from-primary to-primary-dark hover:opacity-90 disabled:opacity-60 shrink-0"
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </form>
      )}

      {confirmingRemove && (
        <ConfirmDeleteModal
          title="Remove your API key?"
          description="AI features will fall back to this app's shared key (if configured), or stop working until you add another key."
          deleting={removing}
          onCancel={() => setConfirmingRemove(false)}
          onConfirm={handleRemove}
        />
      )}
    </div>
  );
};

export default ApiKeySettings;
