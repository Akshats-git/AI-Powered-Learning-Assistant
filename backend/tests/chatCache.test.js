import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import request from "supertest";
import app from "../app.js";
import Chunk from "../models/Chunk.js";
import Document from "../models/Document.js";
import GenerationCache from "../models/GenerationCache.js";
import { createUserWithToken } from "./helpers.js";

vi.mock("../utils/aiClient.js", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    generate: vi.fn(async (prompt, opts) => {
      generate.callCount += 1;
      generate.callsByFeature[opts?.feature] = (generate.callsByFeature[opts?.feature] || 0) + 1;
      if (opts?.feature === "rerank") return { scores: [] };
      if (opts?.feature === "query-rewrite") {
        return generate.rewriteOverride ?? prompt.match(/Follow-up question: "(.*)"/)?.[1] ?? "";
      }
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
    extractedText: "Full extracted text.",
    hasExtractedText: true,
  });

const makeChunk = (documentId, userId) =>
  Chunk.create({
    user: userId,
    document: documentId,
    index: 0,
    text: "The mitochondria is the powerhouse of the cell.",
    page: 4,
    endPage: 4,
    sectionPath: [],
    charStart: 0,
    charEnd: 48,
    tokens: 12,
    contentHash: "hash-0",
  });

beforeEach(() => {
  generate.mockClear();
  generate.callCount = 0;
  generate.callsByFeature = {};
  generate.rewriteOverride = undefined;
  embedTexts.mockClear();
  process.env.OPENAI_API_KEY = "sk-test";
});

afterEach(() => {
  delete process.env.OPENAI_API_KEY;
});

describe("chat semantic cache", () => {
  it("serves a semantically-similar fresh question from cache without calling generate() again", async () => {
    const { user, token } = await createUserWithToken();
    const document = await makeDocument(user._id);
    await makeChunk(document._id, user._id);

    embedTexts.mockResolvedValueOnce([[1, 0, 0]]);
    const first = await request(app)
      .post("/api/ai/chat")
      .set("Authorization", `Bearer ${token}`)
      .send({ documentId: document._id.toString(), message: "How is ATP produced?" });
    expect(first.status).toBe(200);
    const chatCallsAfterFirst = generate.callsByFeature.chat || 0;
    expect(chatCallsAfterFirst).toBeGreaterThan(0);
    expect(await GenerationCache.countDocuments({ document: document._id, feature: "chat" })).toBe(1);

    // A near-identical embedding — standing in for "roughly the same question, reworded."
    embedTexts.mockResolvedValueOnce([[0.9999, 0.001, 0]]);
    const second = await request(app)
      .post("/api/ai/chat")
      .set("Authorization", `Bearer ${token}`)
      .send({ documentId: document._id.toString(), message: "How does the cell produce ATP?" });

    expect(second.status).toBe(200);
    expect(second.body.reply).toBe(first.body.reply);
    expect(second.body.sources).toEqual(first.body.sources);
    // No new *chat completion* — cache short-circuits before generation.
    // (A cheap query-rewrite call is still expected: this is now the second
    // message in the same ChatHistory, so resolving it to a standalone form
    // before checking the cache is unavoidable and correct.)
    expect(generate.callsByFeature.chat).toBe(chatCallsAfterFirst);
  });

  it("does not serve a dissimilar question from cache", async () => {
    const { user, token } = await createUserWithToken();
    const document = await makeDocument(user._id);
    await makeChunk(document._id, user._id);

    embedTexts.mockResolvedValueOnce([[1, 0, 0]]);
    await request(app)
      .post("/api/ai/chat")
      .set("Authorization", `Bearer ${token}`)
      .send({ documentId: document._id.toString(), message: "How is ATP produced?" });
    const callsAfterFirst = generate.callCount;

    embedTexts.mockResolvedValueOnce([[0, 1, 0]]); // orthogonal — a genuinely different question
    await request(app)
      .post("/api/ai/chat")
      .set("Authorization", `Bearer ${token}`)
      .send({ documentId: document._id.toString(), message: "What is the capital of France?" });

    expect(generate.callCount).toBeGreaterThan(callsAfterFirst);
  });

  it("does not serve a stale cache hit to a contextual follow-up that rewrites to a different question", async () => {
    const { user, token } = await createUserWithToken();
    const document = await makeDocument(user._id);
    await makeChunk(document._id, user._id);

    embedTexts.mockResolvedValueOnce([[1, 0, 0]]);
    await request(app)
      .post("/api/ai/chat")
      .set("Authorization", `Bearer ${token}`)
      .send({ documentId: document._id.toString(), message: "How is ATP produced?" });
    const chatCallsAfterFirst = generate.callsByFeature.chat || 0;

    // A follow-up whose rewritten, standalone meaning is genuinely
    // different — the ambiguous raw wording alone should never be enough to
    // (falsely) match the cache; the rewritten form is what's compared.
    generate.rewriteOverride = "What is the capital of France?";
    embedTexts.mockResolvedValueOnce([[0, 1, 0]]); // orthogonal to the cached entry
    const res = await request(app)
      .post("/api/ai/chat")
      .set("Authorization", `Bearer ${token}`)
      .send({ documentId: document._id.toString(), message: "what about that other thing?" });

    expect(res.status).toBe(200);
    expect(generate.callsByFeature.chat).toBeGreaterThan(chatCallsAfterFirst);
  });

  it("still hits the cache for a mid-conversation follow-up that rewrites to the same standalone question as an earlier fresh one", async () => {
    // The whole point of keying the cache off the *rewritten* query instead
    // of "no history exists yet": this scenario was impossible to cache
    // under the old gate (ChatHistory already has messages by the time any
    // follow-up arrives) but is exactly the repeat-question case caching
    // exists for.
    const { user, token } = await createUserWithToken();
    const document = await makeDocument(user._id);
    await makeChunk(document._id, user._id);

    embedTexts.mockResolvedValueOnce([[1, 0, 0]]);
    const first = await request(app)
      .post("/api/ai/chat")
      .set("Authorization", `Bearer ${token}`)
      .send({ documentId: document._id.toString(), message: "How is ATP produced?" });
    const chatCallsAfterFirst = generate.callsByFeature.chat || 0;

    generate.rewriteOverride = "How is ATP produced?";
    embedTexts.mockResolvedValueOnce([[1, 0, 0]]);
    const second = await request(app)
      .post("/api/ai/chat")
      .set("Authorization", `Bearer ${token}`)
      .send({ documentId: document._id.toString(), message: "sorry, can you remind me how that's produced again?" });

    expect(second.status).toBe(200);
    expect(second.body.reply).toBe(first.body.reply);
    expect(generate.callsByFeature.chat).toBe(chatCallsAfterFirst);
  });
});

describe("summary exact-hash cache", () => {
  it("returns a cached summary on a second request for the same document without regenerating", async () => {
    const { user, token } = await createUserWithToken();
    const document = await makeDocument(user._id);

    const first = await request(app).post("/api/ai/summary").set("Authorization", `Bearer ${token}`).send({ documentId: document._id.toString() });
    expect(first.status).toBe(200);
    const callsAfterFirst = generate.callCount;
    expect(callsAfterFirst).toBeGreaterThan(0);

    const second = await request(app).post("/api/ai/summary").set("Authorization", `Bearer ${token}`).send({ documentId: document._id.toString() });
    expect(second.status).toBe(200);
    expect(second.body.summary).toBe(first.body.summary);
    expect(generate.callCount).toBe(callsAfterFirst);
  });
});
