import { describe, it, expect, beforeEach } from "vitest";
import mongoose from "mongoose";
import Chunk from "../models/Chunk.js";
import { loadRetrievalChunks, invalidateChunkCache, clearChunkCache } from "../utils/chunkCache.js";

const addChunks = (documentId, n) =>
  Chunk.insertMany(
    Array.from({ length: n }, (_, i) => ({ user: new mongoose.Types.ObjectId(), document: documentId, index: i, text: `chunk ${i}`, charStart: 0, charEnd: 1, tokens: 1, contentHash: `h${documentId}${i}` }))
  );

beforeEach(() => clearChunkCache());

describe("chunk cache", () => {
  it("serves the second load from memory, not Mongo", async () => {
    const doc = new mongoose.Types.ObjectId();
    await addChunks(doc, 3);
    const first = await loadRetrievalChunks(doc);
    await Chunk.deleteMany({ document: doc }); // would be visible if the second call hit the database
    const second = await loadRetrievalChunks(doc);
    expect(second).toBe(first);
    expect(second).toHaveLength(3);
  });

  it("reloads after invalidation (a re-ingest or a delete)", async () => {
    const doc = new mongoose.Types.ObjectId();
    await addChunks(doc, 2);
    await loadRetrievalChunks(doc);
    await addChunks(doc, 0);
    await Chunk.deleteMany({ document: doc });
    invalidateChunkCache(doc);
    expect(await loadRetrievalChunks(doc)).toHaveLength(0);
  });

  it("never caches an empty result, so a document that gets chunked later is picked up", async () => {
    const doc = new mongoose.Types.ObjectId();
    expect(await loadRetrievalChunks(doc)).toHaveLength(0);
    await addChunks(doc, 2);
    expect(await loadRetrievalChunks(doc)).toHaveLength(2);
  });

  it("evicts the least recently used document when over the chunk budget, and skips a single oversized one", async () => {
    process.env.CHUNK_CACHE_MAX_CHUNKS = "5";
    const mod = await import("../utils/chunkCache.js?budget");
    mod.clearChunkCache();
    const [a, b, big] = [0, 1, 2].map(() => new mongoose.Types.ObjectId());
    await addChunks(a, 3);
    await addChunks(b, 3);
    await addChunks(big, 9);

    const aFirst = await mod.loadRetrievalChunks(a);
    await mod.loadRetrievalChunks(b); // 3 + 3 > 5 → evicts a
    expect(await mod.loadRetrievalChunks(a)).not.toBe(aFirst);

    const bigFirst = await mod.loadRetrievalChunks(big);
    expect(await mod.loadRetrievalChunks(big)).not.toBe(bigFirst); // too large to cache at all
    delete process.env.CHUNK_CACHE_MAX_CHUNKS;
  });
});
