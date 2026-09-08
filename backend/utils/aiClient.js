import OpenAI from "openai";
import { logger } from "./logger.js";

let client;

const getClient = () => {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not configured");
  }
  if (!client) {
    client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return client;
};

const stripJsonFences = (text) =>
  text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/, "")
    .trim();

// Rough, illustrative pricing (USD per 1M tokens) so cost is visible in logs
// without wiring up a billing API. Update when a model's list price changes,
// or when a new model is added to OPENAI_MODEL.
const PRICING_PER_MILLION_TOKENS = {
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
  "gpt-4o": { input: 2.5, output: 10 },
};

export const estimateCostUsd = (model, usage) => {
  const pricing = PRICING_PER_MILLION_TOKENS[model];
  if (!pricing || !usage) return null;
  const inputCost = (usage.prompt_tokens / 1_000_000) * pricing.input;
  const outputCost = (usage.completion_tokens / 1_000_000) * pricing.output;
  return Number((inputCost + outputCost).toFixed(6));
};

export const generate = async (prompt, { json = false, feature = "unknown", onUsage } = {}) => {
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
  const startedAt = Date.now();

  let response;
  try {
    response = await getClient().chat.completions.create({
      model,
      messages: [{ role: "user", content: prompt }],
      ...(json ? { response_format: { type: "json_object" } } : {}),
    });
  } catch (err) {
    const wrapped = new Error(`AI generation failed: ${err.message}`);
    wrapped.statusCode = 502;
    throw wrapped;
  }

  const content = response.choices[0]?.message?.content || "";
  const usage = response.usage;
  const costUsd = estimateCostUsd(model, usage);

  logger.info(
    {
      feature,
      model,
      promptTokens: usage?.prompt_tokens ?? null,
      completionTokens: usage?.completion_tokens ?? null,
      totalTokens: usage?.total_tokens ?? null,
      estimatedCostUsd: costUsd,
      latencyMs: Date.now() - startedAt,
    },
    "LLM call completed"
  );

  // Lets a caller record spend (e.g. against a per-user budget) without
  // changing what generate() returns to its many existing callers.
  if (onUsage) onUsage({ costUsd, usage, model });

  if (!json) return content;

  try {
    return JSON.parse(stripJsonFences(content));
  } catch {
    const err = new Error("AI response was not valid JSON");
    err.statusCode = 502;
    throw err;
  }
};
