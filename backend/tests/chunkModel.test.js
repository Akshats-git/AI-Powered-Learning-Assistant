import { describe, it, expect } from "vitest";
import Chunk from "../models/Chunk.js";
import Document from "../models/Document.js";
import { createUserWithToken } from "./helpers.js";

const makeDocument = async (userId) =>
  Document.create({
    user: userId,
    title: "Source Document",
    fileName: "source.pdf",
    filePath: "/tmp/source.pdf",
    fileSize: 10,
    mimeType: "application/pdf",
    extractedText: "content",
    hasExtractedText: true,
  });

describe("Chunk model", () => {
  it("stores a chunk with its retrieval metadata and embedding", async () => {
    const { user } = await createUserWithToken();
    const document = await makeDocument(user._id);

    const chunk = await Chunk.create({
      user: user._id,
      document: document._id,
      index: 0,
      text: "The mitochondria is the powerhouse of the cell.",
      page: 3,
      endPage: 3,
      sectionPath: ["Introduction", "2.1 Methods"],
      charStart: 0,
      charEnd: 48,
      tokens: 12,
      contentHash: "abc123",
      embedding: [0.1, 0.2, 0.3],
      embeddingModel: "text-embedding-3-small",
    });

    const stored = await Chunk.findById(chunk._id);
    expect(stored.embedding).toEqual([0.1, 0.2, 0.3]);
    expect(stored.sectionPath).toEqual(["Introduction", "2.1 Methods"]);
  });

  it("allows a chunk with no embedding yet (parsed but not embedded)", async () => {
    const { user } = await createUserWithToken();
    const document = await makeDocument(user._id);

    const chunk = await Chunk.create({
      user: user._id,
      document: document._id,
      index: 0,
      text: "Unembedded chunk.",
      charStart: 0,
      charEnd: 18,
      tokens: 4,
      contentHash: "def456",
    });

    expect(chunk.embedding).toBeUndefined();
  });

  it("rejects a second chunk at the same index within a document", async () => {
    const { user } = await createUserWithToken();
    const document = await makeDocument(user._id);

    await Chunk.create({
      user: user._id,
      document: document._id,
      index: 0,
      text: "First.",
      charStart: 0,
      charEnd: 6,
      tokens: 2,
      contentHash: "hash-a",
    });

    await expect(
      Chunk.create({
        user: user._id,
        document: document._id,
        index: 0,
        text: "Duplicate index.",
        charStart: 0,
        charEnd: 17,
        tokens: 4,
        contentHash: "hash-b",
      })
    ).rejects.toThrow();
  });

  it("finds a previously embedded chunk by content hash — the re-upload cache lookup", async () => {
    const { user } = await createUserWithToken();
    const document = await makeDocument(user._id);

    await Chunk.create({
      user: user._id,
      document: document._id,
      index: 0,
      text: "Reused paragraph across two documents.",
      charStart: 0,
      charEnd: 39,
      tokens: 8,
      contentHash: "shared-hash",
      embedding: [0.5, 0.5],
      embeddingModel: "text-embedding-3-small",
    });

    const cached = await Chunk.findOne({ contentHash: "shared-hash", embedding: { $exists: true } });
    expect(cached).not.toBeNull();
    expect(cached.embedding).toEqual([0.5, 0.5]);
  });
});
