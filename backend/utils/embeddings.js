import crypto from "crypto";
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

export const EMBEDDING_MODEL = process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small";

// text-embedding-3-small: $0.02 / 1M tokens as of writing. Same "illustrative,
// update when the price list changes" spirit as aiClient.js's chat pricing
// table — this is for cost visibility in logs and the ledger, not billing.
const EMBEDDING_PRICING_PER_MILLION_TOKENS = {
  "text-embedding-3-small": 0.02,
  "text-embedding-3-large": 0.13,
  "text-embedding-ada-002": 0.1,
};

export const estimateEmbeddingCostUsd = (model, totalTokens) => {
  const pricePerMillion = EMBEDDING_PRICING_PER_MILLION_TOKENS[model];
  if (!pricePerMillion || !Number.isFinite(totalTokens)) return null;
  return Number(((totalTokens / 1_000_000) * pricePerMillion).toFixed(6));
};

// A re-uploaded PDF (or two documents that happen to share a section) should
// cost nothing to embed twice — this hash is the cache key that makes that
// possible once ingestion checks it before calling the API. Hashing the
// chunk's own text (not the whole document) means a single edited paragraph
// only invalidates that one chunk's cache entry, not the entire document's.
export const hashChunkText = (text) => crypto.createHash("sha256").update(text || "", "utf8").digest("hex");

// The API accepts up to 2048 inputs per request but also caps total tokens at
// 300K per request; 100 chunks at ~700 tokens each stays comfortably under
// both limits with room for chunks that ran long, matching the "batched 100
// at a time" plan.
const BATCH_SIZE = 100;

const chunkArray = (items, size) => {
  const batches = [];
  for (let i = 0; i < items.length; i += size) batches.push(items.slice(i, i + size));
  return batches;
};

/**
 * @param texts non-empty strings to embed, in order.
 * @param options.onUsage called once per batch with `{ costUsd, totalTokens, model }`
 *   — lets a caller add embedding spend to the same budget/ledger a chat
 *   completion would (see aiBudget.js, llmLedger.js), without this module
 *   needing to know about either.
 * @returns embedding vectors in the same order as `texts`.
 */
export const embedTexts = async (texts, { onUsage } = {}) => {
  if (!Array.isArray(texts) || texts.length === 0) return [];

  const model = EMBEDDING_MODEL;
  const results = new Array(texts.length);

  for (const batch of chunkArray(
    texts.map((text, index) => ({ text, index })),
    BATCH_SIZE
  )) {
    const startedAt = Date.now();
    let response;
    try {
      response = await getClient().embeddings.create({
        model,
        input: batch.map((b) => b.text),
      });
    } catch (err) {
      const wrapped = new Error(`Embedding generation failed: ${err.message}`);
      wrapped.statusCode = 502;
      throw wrapped;
    }

    const latencyMs = Date.now() - startedAt;
    const totalTokens = response.usage?.total_tokens ?? null;
    const costUsd = estimateEmbeddingCostUsd(model, totalTokens);

    logger.info({ model, batchSize: batch.length, totalTokens, estimatedCostUsd: costUsd, latencyMs }, "Embedding batch completed");
    if (onUsage) onUsage({ costUsd, totalTokens, model, latencyMs });

    // The API returns embeddings tagged with their position in *this
    // request's* input array, not necessarily in request order — map back
    // through `batch[].index` rather than assuming order is preserved.
    for (const item of response.data) {
      results[batch[item.index].index] = item.embedding;
    }
  }

  return results;
};
