import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import app from "../app.js";
import Document from "../models/Document.js";
import Quiz from "../models/Quiz.js";
import Flashcard from "../models/Flashcard.js";
import ChatHistory from "../models/ChatHistory.js";
import { createUserWithToken } from "./helpers.js";

// For every protected resource, user B must never be able to read, modify, or
// delete user A's data by guessing/reusing an id. Every route below is
// expected to answer with 404 (not 403 — we don't want to confirm the id
// exists at all) when the caller doesn't own the resource.
describe("cross-user authorization matrix", () => {
  let tokenB, doc, quiz, flashcardSet;

  beforeEach(async () => {
    const { user: userA } = await createUserWithToken({ email: "owner@example.com" });
    ({ token: tokenB } = await createUserWithToken({ email: "intruder@example.com" }));

    doc = await Document.create({
      user: userA._id,
      title: "Owner's document",
      fileName: "owner.pdf",
      filePath: "/tmp/owner.pdf",
      fileSize: 1234,
      mimeType: "application/pdf",
      extractedText: "the secret contents of this document",
      hasExtractedText: true,
    });

    quiz = await Quiz.create({
      user: userA._id,
      document: doc._id,
      title: "Owner's quiz",
      questions: [
        {
          question: "What is 2+2?",
          options: ["3", "4", "5", "6"],
          correctAnswer: "4",
          explanation: "Basic arithmetic",
        },
      ],
    });

    flashcardSet = await Flashcard.create({
      user: userA._id,
      document: doc._id,
      title: "Owner's flashcards",
      cards: [{ question: "Q", answer: "A", difficulty: "easy" }],
    });

    await ChatHistory.create({
      user: userA._id,
      document: doc._id,
      messages: [{ role: "user", content: "hello" }],
    });
  });

  const asIntruder = (method, url) => request(app)[method](url).set("Authorization", `Bearer ${tokenB}`);

  it("blocks reading another user's document", async () => {
    const res = await asIntruder("get", `/api/documents/${doc._id}`);
    expect(res.status).toBe(404);
  });

  it("blocks deleting another user's document", async () => {
    const res = await asIntruder("delete", `/api/documents/${doc._id}`);
    expect(res.status).toBe(404);
    expect(await Document.findById(doc._id)).not.toBeNull();
  });

  it("blocks reading another user's quiz", async () => {
    const res = await asIntruder("get", `/api/quizzes/${quiz._id}`);
    expect(res.status).toBe(404);
  });

  it("blocks submitting another user's quiz", async () => {
    const res = await asIntruder("post", `/api/quizzes/${quiz._id}/submit`).send({
      answers: [{ questionId: quiz.questions[0]._id, answer: "4" }],
    });
    expect(res.status).toBe(404);
  });

  it("blocks reading another user's quiz results", async () => {
    const res = await asIntruder("get", `/api/quizzes/${quiz._id}/results`);
    expect(res.status).toBe(404);
  });

  it("blocks deleting another user's quiz", async () => {
    const res = await asIntruder("delete", `/api/quizzes/${quiz._id}`);
    expect(res.status).toBe(404);
    expect(await Quiz.findById(quiz._id)).not.toBeNull();
  });

  it("blocks reading another user's flashcard set", async () => {
    const res = await asIntruder("get", `/api/flashcards/${flashcardSet._id}`);
    expect(res.status).toBe(404);
  });

  it("blocks reviewing a card in another user's flashcard set", async () => {
    const cardId = flashcardSet.cards[0]._id;
    const res = await asIntruder("put", `/api/flashcards/${flashcardSet._id}/cards/${cardId}/review`);
    expect(res.status).toBe(404);
  });

  it("blocks deleting another user's flashcard set", async () => {
    const res = await asIntruder("delete", `/api/flashcards/${flashcardSet._id}`);
    expect(res.status).toBe(404);
    expect(await Flashcard.findById(flashcardSet._id)).not.toBeNull();
  });

  it("blocks chatting against another user's document", async () => {
    const res = await asIntruder("post", "/api/ai/chat").send({ documentId: doc._id, message: "hi" });
    expect(res.status).toBe(404);
  });

  it("blocks reading another user's chat history", async () => {
    const res = await asIntruder("get", `/api/ai/chat-history/${doc._id}`);
    expect(res.status).toBe(404);
  });

  it("excludes another user's documents from the list endpoint", async () => {
    const res = await asIntruder("get", "/api/documents");
    expect(res.status).toBe(200);
    expect(res.body.items).toEqual([]);
    expect(res.body.total).toBe(0);
  });
});

// Regression guard for the quiz answer-key leak: list endpoints must never
// serialize correctAnswer/explanation, even for the caller's own quizzes.
describe("quiz answer key never leaks", () => {
  it("is absent from the user's own quiz list", async () => {
    const { user, token } = await createUserWithToken({ email: "student@example.com" });
    const doc = await Document.create({
      user: user._id,
      title: "My document",
      fileName: "mine.pdf",
      filePath: "/tmp/mine.pdf",
      fileSize: 100,
      mimeType: "application/pdf",
      extractedText: "content",
      hasExtractedText: true,
    });
    await Quiz.create({
      user: user._id,
      document: doc._id,
      title: "My quiz",
      questions: [
        {
          question: "Capital of France?",
          options: ["Paris", "London", "Rome", "Berlin"],
          correctAnswer: "Paris",
          explanation: "Paris is the capital of France",
        },
      ],
    });

    const listRes = await request(app).get("/api/quizzes").set("Authorization", `Bearer ${token}`);
    expect(listRes.status).toBe(200);
    const rawList = JSON.stringify(listRes.body);
    expect(rawList).not.toContain("correctAnswer");
    expect(rawList).not.toContain("Paris is the capital");

    const byDocRes = await request(app)
      .get(`/api/quizzes/document/${doc._id}`)
      .set("Authorization", `Bearer ${token}`);
    expect(JSON.stringify(byDocRes.body)).not.toContain("correctAnswer");
  });
});
