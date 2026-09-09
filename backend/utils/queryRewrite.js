import { generate } from "./aiClient.js";
import { assertWithinBudget, recordSpend } from "./aiBudget.js";
import { recordLlmCall } from "./llmLedger.js";
import { logger } from "./logger.js";

// "What about the second one?" is unembeddable as-is — neither BM25 nor a
// vector search has any idea what "the second one" refers to without the
// conversation it came from. This resolves a follow-up into a standalone
// question *before* it's used for retrieval, using the recent conversation
// as context. The rewritten query is only ever used for search; the model
// still answers the user's actual original wording (retrievalChatPrompt
// gets the real `question`, not the rewrite).

const MAX_HISTORY_MESSAGES_FOR_REWRITE = 6;

export const buildQueryRewritePrompt = (history, question) => {
  const historyText = (history || [])
    .slice(-MAX_HISTORY_MESSAGES_FOR_REWRITE)
    .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
    .join("\n");

  return `Given the conversation so far and a follow-up question, rewrite the follow-up into a standalone question that makes sense without the conversation history — resolve pronouns and implicit references (e.g. "the second one", "that", "it", "what about X") using the conversation. If the follow-up is already standalone, return it unchanged.

Conversation so far:
${historyText}

Follow-up question: "${question}"

Respond with ONLY the rewritten standalone question — no quotes, no explanation, no markdown, nothing else.`;
};

/**
 * Best-effort, same shape as embedQuery/rerankChunks/verifyGroundedness: no
 * history (nothing to resolve against), no API key, a budget miss, an empty
 * or missing model response — all fall back to the original question
 * unchanged, exactly what retrieval would have used without this step at
 * all. A bad rewrite should never be a new way for chat to fail.
 */
export const rewriteQuery = async ({ history, question, userId, requestId, feature = "query-rewrite" }) => {
  if (!history || history.length === 0) return question;
  if (!process.env.OPENAI_API_KEY) return question;

  try {
    await assertWithinBudget(userId);

    let usageInfo = null;
    const rewritten = await generate(buildQueryRewritePrompt(history, question), {
      feature,
      onUsage: (info) => {
        usageInfo = info;
      },
    });
    await recordSpend(userId, usageInfo?.costUsd || 0);
    await recordLlmCall(userId, requestId, feature, usageInfo);

    const trimmed = rewritten?.trim().replace(/^"|"$/g, "");
    return trimmed || question;
  } catch (err) {
    logger.error({ err: err.message }, "Query rewrite failed — using the original question for retrieval");
    return question;
  }
};
