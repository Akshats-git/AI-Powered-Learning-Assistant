import LlmCall from "../models/LlmCall.js";
import { getActiveKeySource } from "./aiContext.js";
import { logger } from "./logger.js";

// usageInfo is whatever aiClient.generate()'s onUsage callback captured:
// { costUsd, usage, model, latencyMs }. There's nothing to record if the
// call never reached the provider (e.g. it failed before completion).
export const recordLlmCall = async (userId, requestId, feature, usageInfo) => {
  if (!usageInfo) return;

  await LlmCall.create({
    user: userId,
    feature,
    model: usageInfo.model,
    promptTokens: usageInfo.usage?.prompt_tokens ?? null,
    completionTokens: usageInfo.usage?.completion_tokens ?? null,
    totalTokens: usageInfo.usage?.total_tokens ?? null,
    costUsd: usageInfo.costUsd ?? null,
    latencyMs: usageInfo.latencyMs ?? null,
    requestId,
    keySource: getActiveKeySource() || "shared",
  });
};

// Best-effort, unlike recordLlmCall: this runs on the cache-hit fast path, and
// a failed metrics write shouldn't turn a served-from-cache reply into an error.
export const recordCacheHit = async (userId, requestId, feature, latencyMs = null) => {
  try {
    await LlmCall.create({
      user: userId,
      feature,
      model: "cache",
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      costUsd: 0,
      latencyMs,
      requestId,
      keySource: getActiveKeySource() || "shared",
      cacheHit: true,
    });
  } catch (err) {
    logger.error({ err: err.message, feature }, "Failed to record a cache hit in the LLM ledger");
  }
};
