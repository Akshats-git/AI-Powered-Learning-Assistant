import Chunk from "../models/Chunk.js";
import { chunkText } from "./chunking.js";
import { hashChunkText, embedTexts, EMBEDDING_MODEL } from "./embeddings.js";
import { assertWithinBudget, recordSpend } from "./aiBudget.js";
import { recordLlmCall } from "./llmLedger.js";
import { logger } from "./logger.js";

// The rest of the ingest pipeline the roadmap describes:
//   upload → parse (+OCR fallback) → semantic chunking → embed → index
// `parse` already happens in documentController; this module is
// "chunk → embed → index" — split out from the upload handler because it's
// the part that (a) has real, testable decision logic (which chunks are new,
// which are already embedded) and (b) is where an async job queue (Phase 26)
// will eventually take over from a synchronous upload-time call, so it needs
// a boundary now.

/**
 * Which of this document's chunks still need an embedding computed?
 *
 * Split out as a pure function (no DB, no network) because it's the one
 * decision in this module worth getting right on its own: re-embedding
 * everything on every upload would silently undo the "re-uploading the same
 * PDF costs nothing" cache the content hash exists for.
 *
 * @param chunks freshly computed chunks, each carrying a `contentHash`.
 * @param cachedHashes hashes that already have an embedding stored somewhere
 *   (this document or any other — the hash is of the chunk's own text, so a
 *   shared paragraph across documents is a shared cache hit).
 */
export const partitionChunksToEmbed = (chunks, cachedHashes) => {
  const cached = new Set(cachedHashes || []);
  const toEmbed = [];
  const reused = [];

  for (const chunk of chunks) {
    (cached.has(chunk.contentHash) ? reused : toEmbed).push(chunk);
  }

  return { toEmbed, reused };
};

const withContentHash = (chunk) => ({ ...chunk, contentHash: hashChunkText(chunk.text) });

/**
 * Chunks a document's text, embeds whatever isn't already cached by content
 * hash, and persists everything to the `Chunk` collection — replacing any
 * chunks that document already had (an ingest is always a full rebuild, not
 * an incremental patch; documents aren't edited in place today).
 *
 * Embedding is best-effort: if `OPENAI_API_KEY` isn't configured, chunks are
 * still stored (so BM25-only retrieval and future re-ingestion both work),
 * just without vectors — the same "degrade, don't fail" choice
 * `validateEnv.js` already makes for a missing key elsewhere in the app.
 *
 * Embedding spend goes through the same per-user monthly budget and
 * `LlmCall` ledger as every other AI call in the app — an ingest that skips
 * the budget check would be an ungated cost path.
 *
 * @returns `{ chunkCount, embeddedCount, reusedCount }`
 */
export const ingestDocument = async (document, { requestId = null } = {}) => {
  const chunks = chunkText(document.extractedText, { pageMap: document.pageMap }).map(withContentHash);

  if (chunks.length === 0) {
    await Chunk.deleteMany({ document: document._id });
    return { chunkCount: 0, embeddedCount: 0, reusedCount: 0 };
  }

  // Look up the embedding cache *before* clearing this document's own
  // chunks — otherwise re-ingesting the same document (an edit, or a manual
  // reindex) would delete the very rows this lookup is trying to find,
  // forcing a needless re-embed of unchanged content.
  const hashes = chunks.map((c) => c.contentHash);
  const cached = await Chunk.find({ contentHash: { $in: hashes }, embedding: { $exists: true } })
    .select("contentHash embedding embeddingModel")
    .lean();
  const cacheByHash = new Map(cached.map((c) => [c.contentHash, c]));

  await Chunk.deleteMany({ document: document._id });

  const { toEmbed, reused } = partitionChunksToEmbed(chunks, cacheByHash.keys());

  if (toEmbed.length > 0 && process.env.OPENAI_API_KEY) {
    // One captured usage entry per API batch (embedTexts calls the provider
    // once per 100 chunks) — mirrors "one LlmCall row per provider call"
    // everywhere else, rather than collapsing a whole document's embedding
    // spend into a single row.
    const batchUsages = [];
    try {
      await assertWithinBudget(document.user);
      const vectors = await embedTexts(
        toEmbed.map((c) => c.text),
        { onUsage: (usage) => batchUsages.push(usage) }
      );
      toEmbed.forEach((chunk, i) => {
        chunk.embedding = vectors[i];
        chunk.embeddingModel = EMBEDDING_MODEL;
      });
    } catch (err) {
      // A failed (or budget-blocked) embedding pass shouldn't fail the whole
      // upload — the document is still usable via the truncation-based
      // prompts and BM25-only retrieval; it just isn't vector-searchable
      // until the next ingest succeeds.
      logger.error({ err: err.message, documentId: document._id }, "Embedding pass failed during ingest");
    } finally {
      for (const usage of batchUsages) {
        await recordSpend(document.user, usage.costUsd || 0);
        await recordLlmCall(document.user, requestId, "embedding", {
          model: usage.model,
          usage: { prompt_tokens: usage.totalTokens, completion_tokens: 0, total_tokens: usage.totalTokens },
          costUsd: usage.costUsd,
          latencyMs: usage.latencyMs,
        });
      }
    }
  } else if (toEmbed.length > 0) {
    logger.warn({ documentId: document._id, count: toEmbed.length }, "Skipping embeddings — OPENAI_API_KEY not configured");
  }

  for (const chunk of reused) {
    const cachedEntry = cacheByHash.get(chunk.contentHash);
    chunk.embedding = cachedEntry.embedding;
    chunk.embeddingModel = cachedEntry.embeddingModel;
  }

  await Chunk.insertMany(
    chunks.map((chunk) => ({
      user: document.user,
      document: document._id,
      index: chunk.index,
      text: chunk.text,
      page: chunk.page,
      endPage: chunk.endPage,
      sectionPath: chunk.sectionPath,
      charStart: chunk.charStart,
      charEnd: chunk.charEnd,
      tokens: chunk.tokens,
      contentHash: chunk.contentHash,
      ...(chunk.embedding ? { embedding: chunk.embedding, embeddingModel: chunk.embeddingModel } : {}),
    }))
  );

  return {
    chunkCount: chunks.length,
    embeddedCount: toEmbed.filter((c) => c.embedding).length,
    reusedCount: reused.filter((c) => c.embedding).length,
  };
};
