import axiosInstance from "../utils/axiosInstance";
import { API_PATHS } from "../utils/apiPaths";
import { TOKEN_STORAGE_KEY } from "../utils/constants";
import { parseSse } from "../utils/sse";

// One key per user action, generated when the request is *built*. axiosInstance
// re-sends the same config after a silent token refresh, so a retry carries the
// same key and the server replays the first result instead of paying for (and
// saving) a second generation.
export const newIdempotencyKey = () =>
  globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;

const idempotent = () => ({ headers: { "Idempotency-Key": newIdempotencyKey() } });

export const generateFlashcards = (documentId, count) =>
  axiosInstance.post(API_PATHS.AI.GENERATE_FLASHCARDS, { documentId, count }, idempotent());

export const generateQuiz = (documentId, numQuestions) =>
  axiosInstance.post(API_PATHS.AI.GENERATE_QUIZ, { documentId, numQuestions }, idempotent());

export const getSummary = (documentId) => axiosInstance.post(API_PATHS.AI.SUMMARY, { documentId });

export const explainConcept = (documentId, concept) =>
  axiosInstance.post(API_PATHS.AI.EXPLAIN, { documentId, concept });

export const sendChatMessage = (documentId, message) =>
  axiosInstance.post(API_PATHS.AI.CHAT, { documentId, message }, idempotent());

export const getChatHistory = (documentId) => axiosInstance.get(API_PATHS.AI.CHAT_HISTORY(documentId));

const errorFrom = async (res) => {
  let envelope;
  try {
    envelope = (await res.json()).error;
  } catch {
    // not JSON
  }
  const err = new Error(envelope?.message || `Request failed (${res.status})`);
  err.status = res.status;
  return err;
};

/**
 * Sends a chat message and streams the answer back.
 *
 * axios can't stream in the browser, so this uses fetch — which means it
 * doesn't get axios's silent token refresh for free. On a 401 it pokes a cheap
 * authenticated endpoint through axios (whose interceptor does the refresh) and
 * retries once with the new token.
 *
 * @param handlers.onSources called once with the cited sources, before any text.
 * @param handlers.onToken called with each text delta.
 * @param handlers.signal AbortSignal — aborting stops the answer server-side too.
 * @returns the final `{ reply, sources, groundedness, messages }`.
 * @throws an Error (with `.status` for HTTP failures) for anything that isn't a completed answer.
 */
export const streamChatMessage = async (documentId, message, { onSources, onToken, signal } = {}) => {
  const open = () =>
    fetch(`${import.meta.env.VITE_API_BASE_URL}${API_PATHS.AI.CHAT_STREAM}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem(TOKEN_STORAGE_KEY)}` },
      body: JSON.stringify({ documentId, message }),
      signal,
    });

  let res = await open();
  if (res.status === 401) {
    await axiosInstance.get(API_PATHS.AUTH.PROFILE);
    res = await open();
  }
  if (!res.ok) throw await errorFrom(res);

  let result = null;
  for await (const { event, data } of parseSse(res.body)) {
    if (event === "sources") onSources?.(data.sources);
    else if (event === "token") onToken?.(data.text);
    else if (event === "done") result = data;
    else if (event === "error") throw new Error(data.message || "The answer was interrupted");
  }
  if (!result) throw new Error("The answer was interrupted");
  return result;
};
