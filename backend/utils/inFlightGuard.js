// Rejects a second call for the same key while the first is still running,
// so a double-click (or a retried request) can't kick off two paid LLM
// generations — and, for flashcards/quiz, two persisted records — for the
// same document at once. In-process only: fine for a single server instance;
// move to a Redis lock before running more than one instance.
const inFlight = new Set();

export const withInFlightGuard = async (key, fn) => {
  if (inFlight.has(key)) {
    const err = new Error("A generation request for this document is already in progress");
    err.statusCode = 409;
    throw err;
  }

  inFlight.add(key);
  try {
    return await fn();
  } finally {
    inFlight.delete(key);
  }
};
