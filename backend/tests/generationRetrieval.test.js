import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import app from "../app.js";
import Chunk from "../models/Chunk.js";
import Document from "../models/Document.js";

// Same approach as chatRetrieval.test.js: mock the one call that actually
// reaches OpenAI so the retrieval/context-selection wiring — not the
// provider call — is what's under test.
vi.mock("../utils/aiClient.js", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    generate: vi.fn(async (prompt, opts) => {
      generate.lastPrompt = prompt;
      if (opts?.json && opts.feature === "flashcards") {
        return { flashcards: [{ question: "Q1", answer: "A1", difficulty: "medium" }] };
      }
      if (opts?.json && opts.feature === "quiz") {
        return { questions: [{ question: "Q1", options: ["a", "b", "c", "d"], correctAnswer: "a", explanation: "e" }] };
      }
      return "Mocked text response.";
    }),
  };
});
import { generate } from "../utils/aiClient.js";
import { createUserWithToken } from "./helpers.js";

const RAW_TEXT_MARKER = "Full extracted text used only as the no-chunks fallback.";

const makeDocument = async (userId) =>
  Document.create({
    user: userId,
    title: "Cell Biology",
    fileName: "cells.pdf",
    filePath: "/tmp/cells.pdf",
    fileSize: 10,
    mimeType: "application/pdf",
    extractedText: RAW_TEXT_MARKER,
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
  });

beforeEach(() => {
  generate.mockClear();
});

const ENDPOINTS = [
  { path: "/api/ai/generate-flashcards", body: {}, feature: "flashcards" },
  { path: "/api/ai/generate-quiz", body: {}, feature: "quiz" },
  { path: "/api/ai/summary", body: {}, feature: "summary" },
  { path: "/api/ai/explain", body: { concept: "cellular respiration" }, feature: "explain" },
];

describe.each(ENDPOINTS)("$path — retrieval context", ({ path, body, feature }) => {
  it("uses page-labeled excerpts once the document has been chunked", async () => {
    const { user, token } = await createUserWithToken();
    const document = await makeDocument(user._id);
    await makeChunk(document._id, user._id);

    const res = await request(app)
      .post(path)
      .set("Authorization", `Bearer ${token}`)
      .send({ documentId: document._id.toString(), ...body });

    expect(res.status).toBeLessThan(300);
    expect(generate.lastPrompt).toContain("Excerpt 1");
    expect(generate.lastPrompt).toContain("p. 4");
    expect(generate.lastPrompt).not.toContain(RAW_TEXT_MARKER);
  });

  it("falls back to the raw extracted text when the document has no chunks yet", async () => {
    const { user, token } = await createUserWithToken();
    const document = await makeDocument(user._id);
    // No Chunk rows — an un-ingested or pre-Chunk-model document.

    const res = await request(app)
      .post(path)
      .set("Authorization", `Bearer ${token}`)
      .send({ documentId: document._id.toString(), ...body });

    expect(res.status).toBeLessThan(300);
    expect(generate.lastPrompt).toContain(RAW_TEXT_MARKER);
    expect(generate.lastPrompt).not.toContain("Excerpt 1");
  });
});

describe("generation context sampling", () => {
  it("reaches chunks from the end of a document too large to fit in full, not just the start", async () => {
    const { user, token } = await createUserWithToken();
    const document = await makeDocument(user._id);

    // Comfortably larger than the default 60K-char budget.
    const chunkCount = 40;
    for (let i = 0; i < chunkCount; i += 1) {
      await makeChunk(document._id, user._id, {
        index: i,
        contentHash: `hash-${i}`,
        text: i === chunkCount - 1 ? "UNIQUE_MARKER_AT_THE_VERY_END_OF_THE_DOCUMENT" : "Filler content. ".repeat(200),
        page: i + 1,
        endPage: i + 1,
      });
    }

    await request(app)
      .post("/api/ai/generate-flashcards")
      .set("Authorization", `Bearer ${token}`)
      .send({ documentId: document._id.toString() });

    // A raw slice(0, budget) would never see this — it's the whole point of
    // sampling across the document instead of truncating from the front.
    expect(generate.lastPrompt).toContain("UNIQUE_MARKER_AT_THE_VERY_END_OF_THE_DOCUMENT");
  });
});
