import LlmCall from "../models/LlmCall.js";

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
  });
};
