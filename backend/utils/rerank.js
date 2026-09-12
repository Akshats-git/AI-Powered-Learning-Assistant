import { generate } from "./aiClient.js";
import { assertWithinBudget, recordSpend } from "./aiBudget.js";
import { recordLlmCall } from "./llmLedger.js";
import { hasActiveApiKey } from "./aiContext.js";
import { logger } from "./logger.js";

// "Take the fused top-30 and rerank to top-6 with a cross-encoder" — this
// repo has no cross-encoder model available, so the stand-in is a cheap LLM
// scoring pass: show the model the candidates fused by RRF (rank position,
// not relevance) and have it grade each one's actual relevance to the query.
// RRF is good at "did either retriever think this mattered"; it has no idea
// *how much* — a chunk that both retrievers ranked 25th still gets a fusion
// score, and reranking is what separates "technically matched" from
// "actually answers this."

const CANDIDATE_PREVIEW_CHARS = 300;

const buildRerankPrompt = (query, candidates) => {
  const list = candidates
    .map((c, i) => `[${i}] ${c.text.slice(0, CANDIDATE_PREVIEW_CHARS)}`)
    .join("\n\n");

  return `Rate how relevant each excerpt is to the question below, on a 0-10 scale (10 = directly answers it, 0 = unrelated).

Question: "${query}"

Excerpts:
${list}

Respond with ONLY valid JSON in this exact shape, no markdown fences, no extra text:
{"scores": [{"index": 0, "score": 7}, ...]}
Include exactly one entry per excerpt index shown above.`;
};

/**
 * Parses the model's `{scores: [{index, score}]}` response and reorders
 * `candidates` by it — pure, so the actual sorting logic is unit-testable
 * without mocking a network call. Falls back to the candidates' original
 * (fused) order for any index the model didn't return a valid score for,
 * rather than dropping it — a malformed response should degrade quality,
 * not silently lose a chunk that might still be relevant.
 */
export const applyRerankScores = (candidates, scoresResponse, limit) => {
  const scoreByIndex = new Map();
  for (const entry of scoresResponse?.scores || []) {
    if (Number.isInteger(entry?.index) && Number.isFinite(entry?.score) && candidates[entry.index]) {
      scoreByIndex.set(entry.index, entry.score);
    }
  }

  return candidates
    .map((candidate, index) => ({
      candidate,
      // Ties (including "no score returned") fall back to the fused order —
      // stable-sorted below, so a completely un-scored response is a no-op.
      score: scoreByIndex.has(index) ? scoreByIndex.get(index) : -index,
      originalIndex: index,
    }))
    .sort((a, b) => b.score - a.score || a.originalIndex - b.originalIndex)
    .slice(0, limit)
    .map((entry) => entry.candidate);
};

/**
 * Reranks `candidates` (already fused by hybridSearch, in RRF order) down to
 * `limit` using an LLM relevance-scoring pass. Best-effort: on any failure —
 * no API key, budget exceeded, a malformed response — falls back to the
 * fused order truncated to `limit`, exactly what the caller would have used
 * without reranking at all. Reranking should only ever improve quality, never
 * be a new way for chat or generation to fail.
 */
export const rerankChunks = async ({ query, candidates, limit, userId, requestId, feature = "rerank" }) => {
  const fallback = () => candidates.slice(0, limit);

  if (!Array.isArray(candidates) || candidates.length === 0) return [];
  if (candidates.length <= limit) return candidates;
  if (!hasActiveApiKey()) return fallback();

  try {
    await assertWithinBudget(userId);

    let usageInfo = null;
    const response = await generate(buildRerankPrompt(query, candidates), {
      json: true,
      feature,
      onUsage: (info) => {
        usageInfo = info;
      },
    });
    await recordSpend(userId, usageInfo?.costUsd || 0);
    await recordLlmCall(userId, requestId, feature, usageInfo);

    return applyRerankScores(candidates, response, limit);
  } catch (err) {
    logger.error({ err: err.message, query }, "Reranking failed — falling back to fused order");
    return fallback();
  }
};
