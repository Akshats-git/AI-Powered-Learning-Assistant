import { generate } from "./aiClient.js";
import { assertWithinBudget, recordSpend } from "./aiBudget.js";
import { recordLlmCall } from "./llmLedger.js";
import { logger } from "./logger.js";

// "A second cheap pass checks each claim against the retrieved chunks.
// Unsupported claims get a warning badge instead of being presented as
// fact." — the failure mode this catches is different from retrieval
// quality: even with the right chunks retrieved, a model can still
// paraphrase past what they actually support ("the study found X" when the
// excerpt only implies it). Retrieval answers "did we show the model the
// right material"; this answers "did it actually stick to that material."

export const buildGroundednessPrompt = (answer, context) => `You are fact-checking an AI-generated answer against the source excerpts it was supposed to be based on.

Source excerpts:
"""
${context}
"""

Answer to check:
"""
${answer}
"""

List any specific claims in the answer that are NOT clearly supported by the source excerpts above — i.e. the model appears to have guessed, inferred beyond what's stated, or used outside knowledge. If every claim is supported, return an empty list.

Respond with ONLY valid JSON in this exact shape, no markdown fences, no extra text:
{"grounded": true | false, "unsupportedClaims": ["string", ...]}`;

/**
 * Validates and normalizes the model's raw JSON response. Split out as a
 * pure function so the "what if the model returns garbage" cases are
 * unit-testable without a network call — returns `null` (meaning "couldn't
 * verify," not "ungrounded") for anything that isn't a well-formed response,
 * since a bogus "everything is ungrounded" or "everything is fine" verdict
 * is worse than no verdict at all.
 */
export const parseGroundednessResponse = (response) => {
  if (typeof response?.grounded !== "boolean") return null;
  if (!Array.isArray(response.unsupportedClaims)) return null;

  const unsupportedClaims = response.unsupportedClaims.filter((claim) => typeof claim === "string" && claim.trim());
  return { grounded: response.grounded && unsupportedClaims.length === 0, unsupportedClaims };
};

/**
 * Best-effort, like embedQuery/rerankChunks: no API key, a budget miss, a
 * malformed response, or a provider error all degrade to `null` — meaning
 * "not verified," rendered as no badge at all rather than a false claim
 * either way. Groundedness checking should never be a new way for chat to
 * fail or to mislead.
 */
export const verifyGroundedness = async ({ answer, context, userId, requestId, feature = "groundedness" }) => {
  if (!answer?.trim() || !context?.trim()) return null;
  if (!process.env.OPENAI_API_KEY) return null;

  try {
    await assertWithinBudget(userId);

    let usageInfo = null;
    const response = await generate(buildGroundednessPrompt(answer, context), {
      json: true,
      feature,
      onUsage: (info) => {
        usageInfo = info;
      },
    });
    await recordSpend(userId, usageInfo?.costUsd || 0);
    await recordLlmCall(userId, requestId, feature, usageInfo);

    return parseGroundednessResponse(response);
  } catch (err) {
    logger.error({ err: err.message }, "Groundedness verification failed — omitting the badge");
    return null;
  }
};
