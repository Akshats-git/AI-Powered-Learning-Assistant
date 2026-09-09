import GenerationCache from "../models/GenerationCache.js";
import { cosineSimilarity } from "./vectorSearch.js";

// "Embed the incoming question; if cosine similarity > 0.97 against a prior
// question on the same document, serve the cached answer. Plus an
// exact-hash cache for summaries." Two questions above 0.97 cosine
// similarity are, in practice, the same question reworded — serving the
// cached reply skips the entire retrieval + rerank + generation +
// groundedness pipeline, not just the completion call.
export const SEMANTIC_CACHE_THRESHOLD = 0.97;

/**
 * Pure matching against already-fetched candidates — split out so the
 * threshold logic is unit-testable without touching Mongo.
 * @param candidates `[{ questionEmbedding, ... }]`
 * @returns the best-matching candidate and its score, or `null` if nothing
 *   clears the threshold.
 */
export const findSemanticMatch = (queryEmbedding, candidates, threshold = SEMANTIC_CACHE_THRESHOLD) => {
  if (!queryEmbedding || !candidates || candidates.length === 0) return null;

  let best = null;
  for (const candidate of candidates) {
    const score = cosineSimilarity(queryEmbedding, candidate.questionEmbedding);
    if (score >= threshold && (!best || score > best.score)) best = { candidate, score };
  }
  return best;
};

/**
 * Looks up a cached chat reply for a semantically-similar prior *fresh*
 * question against this document. Bumps the hit counter (best-effort — a
 * failed counter update shouldn't turn a cache hit into a miss).
 */
export const getCachedChatReply = async (documentId, queryEmbedding) => {
  if (!queryEmbedding) return null;

  const candidates = await GenerationCache.find({ document: documentId, feature: "chat" }).select("questionEmbedding output").lean();
  const match = findSemanticMatch(queryEmbedding, candidates);
  if (!match) return null;

  GenerationCache.updateOne({ _id: match.candidate._id }, { $inc: { hitCount: 1 }, $set: { lastHitAt: new Date() } }).catch(() => {});
  return match.candidate.output;
};

export const cacheChatReply = (documentId, question, questionEmbedding, output) => {
  if (!questionEmbedding) return Promise.resolve();
  return GenerationCache.create({ document: documentId, feature: "chat", question, questionEmbedding, output });
};

export const getCachedSummary = async (documentId, contentHash) => {
  const row = await GenerationCache.findOne({ document: documentId, feature: "summary", contentHash }).select("output").lean();
  if (!row) return null;

  GenerationCache.updateOne({ _id: row._id }, { $inc: { hitCount: 1 }, $set: { lastHitAt: new Date() } }).catch(() => {});
  return row.output.summary;
};

export const cacheSummary = (documentId, contentHash, summary) =>
  GenerationCache.create({ document: documentId, feature: "summary", contentHash, output: { summary } });
