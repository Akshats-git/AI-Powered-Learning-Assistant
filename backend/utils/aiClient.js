import OpenAI from "openai";
import { logger } from "./logger.js";
import { modelForFeature } from "./modelRouting.js";
import { getActiveApiKey } from "./aiContext.js";

// No module-level singleton anymore: the active key can differ per request
// (a user's own key vs. the deployer's shared fallback — see aiContext.js),
// so a client has to be built fresh per call. `new OpenAI()` does no network
// I/O, so this costs nothing next to the API call itself.
const getClient = () => {
  const apiKey = getActiveApiKey();
  if (!apiKey) {
    const err = new Error("No OpenAI API key is configured. Add your own key in Profile settings, or ask the site owner to configure one.");
    err.statusCode = 400;
    throw err;
  }
  return new OpenAI({ apiKey });
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
  // Per-feature routing (utils/modelRouting.js) — quiz generation gets the
  // stronger model, everything else defaults to the cheap one.
  const model = modelForFeature(feature);
  const startedAt = Date.now();

  // Outside the try/catch below on purpose: a missing key is a 400 the user
  // can fix themselves (add a key in Profile), not a 502 provider failure —
  // wrapping it into "AI generation failed" would bury that distinction.
  const openai = getClient();

  let response;
  try {
    response = await openai.chat.completions.create({
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
  const latencyMs = Date.now() - startedAt;

  logger.info(
    {
      feature,
      model,
      promptTokens: usage?.prompt_tokens ?? null,
      completionTokens: usage?.completion_tokens ?? null,
      totalTokens: usage?.total_tokens ?? null,
      estimatedCostUsd: costUsd,
      latencyMs,
    },
    "LLM call completed"
  );

  // Lets a caller record spend (e.g. against a per-user budget, or a
  // persistent cost ledger) without changing what generate() returns to its
  // many existing callers.
  if (onUsage) onUsage({ costUsd, usage, model, latencyMs });

  if (!json) return content;

  try {
    return JSON.parse(stripJsonFences(content));
  } catch {
    const err = new Error("AI response was not valid JSON");
    err.statusCode = 502;
    throw err;
  }
};
