import { useEffect, useRef, useState } from "react";
import { Send, Square } from "lucide-react";
import toast from "react-hot-toast";

import { getChatHistory, streamChatMessage } from "../../../services/aiService";
import MarkdownRenderer from "../../ui/MarkdownRenderer";
import ChatSources from "./ChatSources";

const ChatTab = ({ documentId, onOpenPage }) => {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef(null);
  const abortRef = useRef(null);

  // Leaving the tab mid-answer stops the generation server-side too.
  useEffect(() => () => abortRef.current?.abort(), []);

  useEffect(() => {
    getChatHistory(documentId)
      .then((res) => setMessages(res.data))
      .finally(() => setLoading(false));
  }, [documentId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

  const handleSend = async (e) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || sending) return;

    const controller = new AbortController();
    abortRef.current = controller;
    setMessages((prev) => [
      ...prev,
      { role: "user", content: text, timestamp: new Date().toISOString() },
      { role: "assistant", content: "", streaming: true },
    ]);
    setInput("");
    setSending(true);

    const updateLast = (patch) =>
      setMessages((prev) => prev.map((m, i) => (i === prev.length - 1 ? { ...m, ...(typeof patch === "function" ? patch(m) : patch) } : m)));

    try {
      const result = await streamChatMessage(documentId, text, {
        signal: controller.signal,
        onSources: (sources) => updateLast({ sources }),
        onToken: (delta) => updateLast((m) => ({ content: m.content + delta })),
      });
      setMessages(result.messages);
    } catch (err) {
      // Drop the unfinished placeholder; the user's own message stays. A Stop click is not an error.
      setMessages((prev) => prev.filter((m) => !m.streaming));
      if (err.name !== "AbortError") toast.error(err.message || "Something went wrong");
    } finally {
      abortRef.current = null;
      setSending(false);
    }
  };

  return (
    <div className="bg-white rounded-xl border border-gray-100 flex flex-col h-[75vh]">
      {/* role=log + aria-live: a screen reader announces the answer as it streams in. */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4" role="log" aria-live="polite" aria-label="Conversation">
        {loading ? (
          <p className="text-sm text-gray-400 text-center mt-10">Loading conversation...</p>
        ) : messages.length === 0 ? (
          <p className="text-sm text-gray-400 text-center mt-10">
            Ask a question about this document to get started.
          </p>
        ) : (
          messages.filter((m) => !(m.streaming && !m.content)).map((m, i) => (
            <div key={i} className={`flex flex-col ${m.role === "user" ? "items-end" : "items-start"}`}>
              <div
                className={`max-w-[75%] rounded-2xl px-4 py-2.5 text-sm ${
                  m.role === "user"
                    ? "bg-gradient-to-r from-primary to-primary-dark text-white"
                    : "bg-white border border-gray-100 text-gray-800"
                }`}
              >
                {m.role === "user" ? (
                  <p className="whitespace-pre-wrap">{m.content}</p>
                ) : (
                  <MarkdownRenderer content={m.content} />
                )}
              </div>
              {m.role === "assistant" && <ChatSources sources={m.sources} groundedness={m.groundedness} onOpenPage={onOpenPage} />}
            </div>
          ))
        )}

        {sending && !messages.some((m) => m.streaming && m.content) && (
          <div className="flex justify-start">
            <div className="rounded-2xl px-4 py-2.5 bg-white border border-gray-100 flex gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-gray-300 animate-bounce [animation-delay:-0.3s]" />
              <span className="w-1.5 h-1.5 rounded-full bg-gray-300 animate-bounce [animation-delay:-0.15s]" />
              <span className="w-1.5 h-1.5 rounded-full bg-gray-300 animate-bounce" />
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={handleSend} className="flex items-center gap-2 p-3 border-t border-gray-100">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask a question about this document..."
          className="flex-1 px-4 py-2.5 rounded-lg border border-gray-200 text-sm outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
        />
        {sending && (
          <button
            type="button"
            onClick={() => abortRef.current?.abort()}
            className="w-10 h-10 shrink-0 flex items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50"
            aria-label="Stop generating"
          >
            <Square className="w-4 h-4" />
          </button>
        )}
        <button
          type="submit"
          disabled={sending || !input.trim()}
          className="w-10 h-10 shrink-0 flex items-center justify-center rounded-lg text-white bg-gradient-to-r from-primary to-primary-dark hover:opacity-90 disabled:opacity-50"
          aria-label="Send"
        >
          <Send className="w-4 h-4" />
        </button>
      </form>
    </div>
  );
};

export default ChatTab;
