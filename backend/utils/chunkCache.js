import Chunk from "../models/Chunk.js";

// Chat and targeted generation both need every chunk of a document *with* its embedding
// to run hybrid search. For a long PDF that is thousands of 1,536-number vectors — tens
// of megabytes read from Mongo and parsed again for every single question. Questions
// about one document come in bursts, so a small cache of recently used documents makes
// every question after the first nearly free.
//
// Bounded two ways so it can't become its own problem: by total chunks held (memory) and
// by age (staleness if another process re-ingested). ingestDocument / deleteDocumentData
// drop a document's entry the moment its chunks change.
const MAX_TOTAL_CHUNKS = Number(process.env.CHUNK_CACHE_MAX_CHUNKS) || 6000;
const TTL_MS = Number(process.env.CHUNK_CACHE_TTL_MS) || 5 * 60 * 1000;

const entries = new Map(); // documentId -> { chunks, expiresAt }; Map order = recency
let totalChunks = 0;

const drop = (key) => {
  const entry = entries.get(key);
  if (!entry) return;
  totalChunks -= entry.chunks.length;
  entries.delete(key);
};

export const invalidateChunkCache = (documentId) => drop(String(documentId));

export const clearChunkCache = () => {
  entries.clear();
  totalChunks = 0;
};

/** A document's chunks in the shape retrieval needs. Callers must not mutate the result. */
export const loadRetrievalChunks = async (documentId) => {
  const key = String(documentId);
  const hit = entries.get(key);
  if (hit && hit.expiresAt > Date.now()) {
    entries.delete(key); // re-insert to mark as most recently used
    entries.set(key, hit);
    return hit.chunks;
  }
  drop(key);

  const chunks = await Chunk.find({ document: documentId }).select("text page endPage sectionPath embedding charStart").lean();

  // A single huge document is simply not cached rather than evicting everything else for it.
  if (chunks.length > 0 && chunks.length <= MAX_TOTAL_CHUNKS) {
    while (totalChunks + chunks.length > MAX_TOTAL_CHUNKS && entries.size > 0) drop(entries.keys().next().value);
    entries.set(key, { chunks, expiresAt: Date.now() + TTL_MS });
    totalChunks += chunks.length;
  }
  return chunks;
};
