import { AsyncLocalStorage } from "async_hooks";

// Threads "which OpenAI API key should this request use, and whose is it"
// through the whole call stack (controllers, ingest, retrieval, rerank,
// budget checks) without changing every function's signature to accept an
// apiKey param. middlewares/aiKeyContext.js is the only thing that calls
// runWithApiKey — it resolves the caller's own key (if they've saved one on
// their profile) or falls back to the server's shared OPENAI_API_KEY, once,
// at the top of the request.
const als = new AsyncLocalStorage();

export const runWithApiKey = (store, callback) => als.run(store, callback);

// Falls back to process.env directly (not just an empty store) so every
// existing util that calls this outside of an Express request — a script, or
// a test that calls ingestDocument/rerankChunks/etc. directly — keeps
// working exactly as it did before per-user keys existed.
export const getActiveApiKey = () => als.getStore()?.apiKey || process.env.OPENAI_API_KEY || null;

// "shared" = the deployer's own OPENAI_API_KEY (budget-capped per user via
// aiBudget.js). "own" = the requesting user's saved key (their money, no
// cap). Callers use this to decide whether a call's cost should count
// against anyone's budget or the admin cost dashboard.
export const getActiveKeySource = () => {
  const store = als.getStore();
  if (store) return store.keySource || null;
  return process.env.OPENAI_API_KEY ? "shared" : null;
};

export const hasActiveApiKey = () => Boolean(getActiveApiKey());
