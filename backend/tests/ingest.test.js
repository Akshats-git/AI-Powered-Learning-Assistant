import { describe, it, expect } from "vitest";
import { partitionChunksToEmbed, ingestDocument } from "../utils/ingest.js";
import Chunk from "../models/Chunk.js";
import Document from "../models/Document.js";
import { chunkText } from "../utils/chunking.js";
import { hashChunkText } from "../utils/embeddings.js";
import { createUserWithToken } from "./helpers.js";

describe("partitionChunksToEmbed", () => {
  const chunks = [
    { contentHash: "hash-a", text: "a" },
    { contentHash: "hash-b", text: "b" },
    { contentHash: "hash-c", text: "c" },
  ];

  it("splits chunks into ones that need embedding and ones already cached", () => {
    const { toEmbed, reused } = partitionChunksToEmbed(chunks, ["hash-b"]);

    expect(toEmbed.map((c) => c.contentHash)).toEqual(["hash-a", "hash-c"]);
    expect(reused.map((c) => c.contentHash)).toEqual(["hash-b"]);
  });

  it("treats everything as needing embedding when nothing is cached", () => {
    const { toEmbed, reused } = partitionChunksToEmbed(chunks, []);
    expect(toEmbed).toHaveLength(3);
    expect(reused).toHaveLength(0);
  });

  it("treats everything as reused when every hash is cached", () => {
    const { toEmbed, reused } = partitionChunksToEmbed(chunks, ["hash-a", "hash-b", "hash-c"]);
    expect(toEmbed).toHaveLength(0);
    expect(reused).toHaveLength(3);
  });

  it("handles an empty chunk list", () => {
    expect(partitionChunksToEmbed([], ["hash-a"])).toEqual({ toEmbed: [], reused: [] });
  });
});

const makeDocument = async (userId, extractedText) =>
  Document.create({
    user: userId,
    title: "Source Document",
    fileName: "source.pdf",
    filePath: "/tmp/source.pdf",
    fileSize: 10,
    mimeType: "application/pdf",
    extractedText,
    hasExtractedText: Boolean(extractedText && extractedText.trim()),
  });

// No test in this suite sets OPENAI_API_KEY (tests/setup.js never does, and
// nothing here does either), so every ingestDocument call below exercises the
// "no API key configured" degrade path — chunks are stored without vectors.
// This is the realistic CI/no-key condition, not a workaround.
describe("ingestDocument", () => {
  it("chunks and stores a document's text as Chunk rows", async () => {
    const { user } = await createUserWithToken();
    const document = await makeDocument(user._id, "# Intro\n\nSome content about the subject matter here.");

    const result = await ingestDocument(document);

    expect(result.chunkCount).toBeGreaterThan(0);
    const stored = await Chunk.find({ document: document._id }).sort({ index: 1 });
    expect(stored).toHaveLength(result.chunkCount);
    expect(stored[0].contentHash).toBe(hashChunkText(stored[0].text));
  });

  it("stores chunks without embeddings when OPENAI_API_KEY isn't configured, rather than failing", async () => {
    const { user } = await createUserWithToken();
    const document = await makeDocument(user._id, "Some content about the subject matter here.");

    const result = await ingestDocument(document);

    expect(result.embeddedCount).toBe(0);
    const stored = await Chunk.find({ document: document._id });
    expect(stored.every((c) => c.embedding === undefined)).toBe(true);
  });

  it("stores nothing for a document with no extracted text (a scanned PDF)", async () => {
    const { user } = await createUserWithToken();
    const document = await makeDocument(user._id, "");

    const result = await ingestDocument(document);

    expect(result).toEqual({ chunkCount: 0, embeddedCount: 0, reusedCount: 0 });
    expect(await Chunk.countDocuments({ document: document._id })).toBe(0);
  });

  it("replaces a document's chunks on re-ingest rather than appending to them", async () => {
    const { user } = await createUserWithToken();
    const document = await makeDocument(user._id, "First version of the content.");

    await ingestDocument(document);
    const firstCount = await Chunk.countDocuments({ document: document._id });
    expect(firstCount).toBeGreaterThan(0);

    document.extractedText = "Completely different second version of the content, much longer than before.";
    await ingestDocument(document);

    const secondBatch = await Chunk.find({ document: document._id });
    expect(secondBatch.every((c) => c.text.includes("second version"))).toBe(true);
  });

  it("produces chunks whose page/section metadata matches the pure chunker for the same input", async () => {
    const { user } = await createUserWithToken();
    const pageMap = [{ page: 1, start: 0, end: 40 }];
    const document = await makeDocument(user._id, "# Heading\n\nBody text describing a concept in detail.");
    document.pageMap = pageMap;

    await ingestDocument(document);
    const [stored] = await Chunk.find({ document: document._id }).sort({ index: 1 });
    const [expected] = chunkText(document.extractedText, { pageMap });

    expect(stored.page).toBe(expected.page);
    expect(stored.sectionPath).toEqual(expected.sectionPath);
    expect(stored.charStart).toBe(expected.charStart);
  });
});

describe("ingestDocument — cross-document embedding cache", () => {
  it("reuses a cached embedding for identical chunk text from a different document", async () => {
    const { user } = await createUserWithToken();
    const sharedText = "This exact paragraph appears in two different uploaded documents.";

    const docA = await makeDocument(user._id, sharedText);
    await ingestDocument(docA);

    // Manually mark docA's chunk as embedded, standing in for a successful
    // embedding pass (this suite never has a real API key to produce one).
    const chunkA = await Chunk.findOne({ document: docA._id });
    chunkA.embedding = [0.1, 0.2, 0.3];
    chunkA.embeddingModel = "text-embedding-3-small";
    await chunkA.save();

    const docB = await makeDocument(user._id, sharedText);
    const result = await ingestDocument(docB);

    expect(result.reusedCount).toBe(1);
    expect(result.embeddedCount).toBe(0);
    const chunkB = await Chunk.findOne({ document: docB._id });
    expect(chunkB.embedding).toEqual([0.1, 0.2, 0.3]);
    expect(chunkB.embeddingModel).toBe("text-embedding-3-small");
  });
});
