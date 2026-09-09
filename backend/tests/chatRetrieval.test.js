import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import request from "supertest";
import app from "../app.js";
import Chunk from "../models/Chunk.js";
import Document from "../models/Document.js";
import ChatHistory from "../models/ChatHistory.js";
import { createUserWithToken } from "./helpers.js";

// generate() and embedTexts() are the two calls in this path that actually
// reach OpenAI, and nothing in this test env has a real API key — mock both
// so the retrieval wiring itself (not the provider calls) is what's under
// test, same idea as the roadmap's own "LLM calls mocked from recorded
// fixtures" plan for evals. embedTexts is only ever invoked when
// OPENAI_API_KEY is set (chatWithDocument checks before calling it), which is
// true for exactly one test below — everywhere else its mock is unused.
vi.mock("../utils/aiClient.js", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    generate: vi.fn(async (prompt) => {
      generate.lastPrompt = prompt;
      return "Mocked answer.";
    }),
  };
});
vi.mock("../utils/embeddings.js", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, embedTexts: vi.fn() };
});
import { generate } from "../utils/aiClient.js";
import { embedTexts } from "../utils/embeddings.js";

const makeDocument = async (userId) =>
  Document.create({
    user: userId,
    title: "Cell Biology",
    fileName: "cells.pdf",
    filePath: "/tmp/cells.pdf",
    fileSize: 10,
    mimeType: "application/pdf",
    extractedText: "Full extracted text used only as the no-chunks fallback.",
    hasExtractedText: true,
  });

const makeChunk = (documentId, userId, overrides = {}) =>
  Chunk.create({
    user: userId,
    document: documentId,
    index: overrides.index ?? 0,
    text: overrides.text ?? "The mitochondria is the powerhouse of the cell.",
    page: overrides.page ?? 4,
    endPage: overrides.endPage ?? 4,
    sectionPath: overrides.sectionPath ?? ["Cell Biology"],
    charStart: 0,
    charEnd: 48,
    tokens: 12,
    contentHash: overrides.contentHash ?? `hash-${overrides.index ?? 0}`,
    ...(overrides.embedding ? { embedding: overrides.embedding, embeddingModel: "text-embedding-3-small" } : {}),
  });

beforeEach(() => {
  generate.mockClear();
  embedTexts.mockClear();
});

afterEach(() => {
  delete process.env.OPENAI_API_KEY;
});

describe("POST /api/ai/chat — retrieval wiring", () => {
  it("uses the retrieval-augmented prompt and returns sources when the document has chunks", async () => {
    const { user, token } = await createUserWithToken();
    const document = await makeDocument(user._id);
    await makeChunk(document._id, user._id, { text: "Photosynthesis converts light into chemical energy in plants." });
    await makeChunk(document._id, user._id, { index: 1, contentHash: "hash-1", text: "Mitochondria produce ATP via cellular respiration." });

    const res = await request(app)
      .post("/api/ai/chat")
      .set("Authorization", `Bearer ${token}`)
      .send({ documentId: document._id.toString(), message: "How is ATP produced?" });

    expect(res.status).toBe(200);
    expect(res.body.reply).toBe("Mocked answer.");
    expect(res.body.sources.length).toBeGreaterThan(0);
    expect(res.body.sources[0]).toMatchObject({ page: 4, sectionPath: ["Cell Biology"] });

    // The model was shown retrieved excerpts, not the raw document text.
    expect(generate.lastPrompt).toContain("Excerpt");
    expect(generate.lastPrompt).toContain("ATP");
    expect(generate.lastPrompt).not.toContain("Full extracted text used only as the no-chunks fallback.");
  });

  it("persists sources on the assistant message so a reloaded chat still shows them", async () => {
    const { user, token } = await createUserWithToken();
    const document = await makeDocument(user._id);
    await makeChunk(document._id, user._id);

    await request(app)
      .post("/api/ai/chat")
      .set("Authorization", `Bearer ${token}`)
      .send({ documentId: document._id.toString(), message: "What powers the cell?" });

    const stored = await ChatHistory.findOne({ user: user._id, document: document._id });
    const assistantMessage = stored.messages.find((m) => m.role === "assistant");
    expect(assistantMessage.sources).toBeDefined();
    expect(assistantMessage.sources.length).toBeGreaterThan(0);

    const userMessage = stored.messages.find((m) => m.role === "user");
    expect(userMessage.sources).toBeUndefined();
  });

  it("falls back to the whole-document prompt when the document has no chunks yet", async () => {
    const { user, token } = await createUserWithToken();
    const document = await makeDocument(user._id);
    // No Chunk rows created — simulates a document ingested before Chunk
    // existed, or an ingest that failed.

    const res = await request(app)
      .post("/api/ai/chat")
      .set("Authorization", `Bearer ${token}`)
      .send({ documentId: document._id.toString(), message: "Summarize this" });

    expect(res.status).toBe(200);
    expect(res.body.sources).toEqual([]);
    expect(generate.lastPrompt).toContain("Full extracted text used only as the no-chunks fallback.");
    expect(generate.lastPrompt).not.toContain("Excerpt");
  });

  it("falls back to the whole document when chunks exist but none match the question at all", async () => {
    const { user, token } = await createUserWithToken();
    const document = await makeDocument(user._id);
    await makeChunk(document._id, user._id, { text: "zzz qqq xxx unrelated gibberish tokens" });

    const res = await request(app)
      .post("/api/ai/chat")
      .set("Authorization", `Bearer ${token}`)
      .send({ documentId: document._id.toString(), message: "completely different wording entirely" });

    expect(res.status).toBe(200);
    // With no lexical overlap and no query embedding (no API key), hybrid
    // search finds nothing — silence would be worse than the old behavior.
    expect(res.body.sources).toEqual([]);
    expect(generate.lastPrompt).toContain("Full extracted text used only as the no-chunks fallback.");
  });

  it("uses vector search too when an API key and embeddings are available", async () => {
    process.env.OPENAI_API_KEY = "sk-test";
    embedTexts.mockResolvedValueOnce([[1, 0, 0]]);

    const { user, token } = await createUserWithToken();
    const document = await makeDocument(user._id);
    // Lexically unrelated to the question, but vector-close via the mocked embedding.
    await makeChunk(document._id, user._id, {
      text: "This chunk has no lexical overlap with the question at all.",
      embedding: [1, 0, 0],
    });

    const res = await request(app)
      .post("/api/ai/chat")
      .set("Authorization", `Bearer ${token}`)
      .send({ documentId: document._id.toString(), message: "asdf jkl semantically distant phrasing" });

    expect(res.status).toBe(200);
    expect(res.body.sources.length).toBeGreaterThan(0);
    expect(embedTexts).toHaveBeenCalledWith(
      ["asdf jkl semantically distant phrasing"],
      expect.objectContaining({ onUsage: expect.any(Function) })
    );
  });
});
