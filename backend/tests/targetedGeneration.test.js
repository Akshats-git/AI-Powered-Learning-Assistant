import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import app from "../app.js";
import Document from "../models/Document.js";
import Chunk from "../models/Chunk.js";
import Flashcard from "../models/Flashcard.js";
import Quiz from "../models/Quiz.js";
import { createUserWithToken } from "./helpers.js";

vi.mock("../utils/aiClient.js", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    generate: vi.fn(async (prompt, opts) => {
      generate.prompts.push(prompt);
      if (opts?.feature === "quiz") return { questions: [{ question: "Q?", options: ["a", "b", "c", "d"], correctAnswer: "a", explanation: "e", concept: "Eigenvalue decomposition" }] };
      return { flashcards: [{ question: "q", answer: "a", difficulty: "hard" }] };
    }),
  };
});
import { generate } from "../utils/aiClient.js";

beforeEach(() => {
  generate.prompts = [];
});

const seed = async () => {
  const { user, token } = await createUserWithToken();
  const document = await Document.create({ user: user._id, title: "Linear Algebra", fileName: "la.pdf", filePath: "/tmp/la.pdf", fileSize: 1, mimeType: "application/pdf", extractedText: "text", hasExtractedText: true });
  const texts = [
    "Eigenvalue decomposition factors a square matrix into eigenvectors and eigenvalues.",
    "Gaussian elimination reduces a matrix to row echelon form by row operations.",
    "The determinant measures how a linear map scales volume.",
    "Singular value decomposition generalises eigenvalue decomposition to rectangular matrices.",
  ];
  for (const [i, text] of texts.entries()) {
    await Chunk.create({ user: user._id, document: document._id, index: i, text, page: i + 1, endPage: i + 1, sectionPath: [], charStart: i * 100, charEnd: i * 100 + 90, tokens: 12, contentHash: `t-${i}` });
  }
  return { user, token, document };
};

const post = (token, path, body) => request(app).post(`/api/ai/${path}`).set("Authorization", `Bearer ${token}`).send(body);

describe("concept-targeted generation", () => {
  it("flashcards: builds the prompt from chunks retrieved for the concept, not the whole document", async () => {
    const { token, document } = await seed();
    const res = await post(token, "generate-flashcards", { documentId: document._id.toString(), count: 4, concept: "eigenvalue decomposition" });

    expect(res.status).toBe(201);
    const prompt = generate.prompts[0];
    expect(prompt).toContain('"eigenvalue decomposition"');
    expect(prompt).toContain("factors a square matrix into eigenvectors");
    expect(prompt).not.toContain("Gaussian elimination"); // unrelated chunk is left out
    expect(prompt).toContain("generate 4 flashcards".replace("generate", "Generate"));
  });

  it("flashcards: titles the set after the concept so it's recognisable in the list", async () => {
    const { token, document } = await seed();
    const res = await post(token, "generate-flashcards", { documentId: document._id.toString(), concept: "eigenvalue decomposition" });
    expect(res.body.title).toBe("Linear Algebra — eigenvalue decomposition");
    expect((await Flashcard.findById(res.body._id)).title).toContain("eigenvalue decomposition");
  });

  it("quiz: instructs the model to tag every question with the concept so mastery updates", async () => {
    const { token, document } = await seed();
    const res = await post(token, "generate-quiz", { documentId: document._id.toString(), numQuestions: 3, concept: "eigenvalue decomposition" });

    expect(res.status).toBe(201);
    expect(generate.prompts[0]).toContain('exactly "eigenvalue decomposition"');
    expect(res.body.title).toBe("Linear Algebra — eigenvalue decomposition quiz");
    // The mock model returned a paraphrased tag; the server pins it to the requested concept.
    expect((await Quiz.findById(res.body._id)).questions[0].concept).toBe("eigenvalue decomposition");
  });

  it("without a concept the behaviour is unchanged (whole-document sampling, original title)", async () => {
    const { token, document } = await seed();
    const res = await post(token, "generate-flashcards", { documentId: document._id.toString() });
    expect(res.body.title).toBe("Linear Algebra Flashcards");
    expect(generate.prompts[0]).toContain("Gaussian elimination"); // the whole doc is in play
  });

  it("404s clearly when nothing in the document matches the concept, and spends nothing", async () => {
    const { token, document } = await seed();
    const res = await post(token, "generate-flashcards", { documentId: document._id.toString(), concept: "quantum chromodynamics" });
    expect(res.status).toBe(404);
    expect(res.body.error.message).toContain("quantum chromodynamics");
    expect(generate.prompts).toHaveLength(0);
    expect(await Flashcard.countDocuments()).toBe(0);
  });

  it("rejects an empty or oversized concept", async () => {
    const { token, document } = await seed();
    expect((await post(token, "generate-flashcards", { documentId: document._id.toString(), concept: "   " })).status).toBe(400);
    expect((await post(token, "generate-quiz", { documentId: document._id.toString(), concept: "x".repeat(201) })).status).toBe(400);
  });

  it("a concept run and a whole-document run don't block each other (separate in-flight keys)", async () => {
    const { token, document } = await seed();
    const [a, b] = await Promise.all([
      post(token, "generate-flashcards", { documentId: document._id.toString(), concept: "eigenvalue decomposition" }),
      post(token, "generate-flashcards", { documentId: document._id.toString() }),
    ]);
    expect([a.status, b.status]).toEqual([201, 201]);
  });
});
