import { describe, it, expect } from "vitest";
import request from "supertest";
import mongoose from "mongoose";
import app from "../app.js";
import Document from "../models/Document.js";
import Chunk from "../models/Chunk.js";
import Flashcard from "../models/Flashcard.js";
import Quiz from "../models/Quiz.js";
import QuizAttempt from "../models/QuizAttempt.js";
import ChatHistory from "../models/ChatHistory.js";
import Mastery from "../models/Mastery.js";
import GenerationCache from "../models/GenerationCache.js";
import ReviewLog from "../models/ReviewLog.js";
import { createUserWithToken } from "./helpers.js";

const seedDocument = async (user, title) => {
  const document = await Document.create({
    user: user._id, title, fileName: `${title}.pdf`, filePath: `/tmp/none/${title}.pdf`, fileSize: 1, mimeType: "application/pdf", extractedText: "text",
  });
  const base = { user: user._id, document: document._id };
  await Chunk.create({ ...base, index: 0, text: "text", charStart: 0, charEnd: 4, tokens: 1, contentHash: `h-${title}` });
  const set = await Flashcard.create({ ...base, title: "set", cards: [{ question: "q", answer: "a" }] });
  const quiz = await Quiz.create({ ...base, title: "quiz", questions: [{ question: "q", options: ["a", "b", "c", "d"], correctAnswer: "a" }] });
  await QuizAttempt.create({ ...base, quiz: quiz._id, answers: [], total: 1, correct: 1, score: 100 });
  await ChatHistory.create({ ...base, messages: [{ role: "user", content: "hi" }] });
  await Mastery.create({ ...base, concept: "c" });
  await GenerationCache.create({ document: document._id, feature: "summary", contentHash: "x", output: { summary: "s" } });
  await ReviewLog.create({ user: user._id, flashcardSet: set._id, cardId: set.cards[0]._id, algorithm: "fsrs", grade: "good", reviewedAt: new Date(), stateBefore: {}, stateAfter: {} });
  return document;
};

const countsFor = async (documentId) => ({
  chunks: await Chunk.countDocuments({ document: documentId }),
  flashcards: await Flashcard.countDocuments({ document: documentId }),
  quizzes: await Quiz.countDocuments({ document: documentId }),
  attempts: await QuizAttempt.countDocuments({ document: documentId }),
  chats: await ChatHistory.countDocuments({ document: documentId }),
  mastery: await Mastery.countDocuments({ document: documentId }),
  cache: await GenerationCache.countDocuments({ document: documentId }),
});

describe("DELETE /api/documents/:id", () => {
  it("removes every row derived from the document, and nothing that belongs to another document", async () => {
    const { user, token } = await createUserWithToken();
    const doomed = await seedDocument(user, "doomed");
    const survivor = await seedDocument(user, "survivor");

    const res = await request(app).delete(`/api/documents/${doomed._id}`).set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);

    expect(await countsFor(doomed._id)).toEqual({ chunks: 0, flashcards: 0, quizzes: 0, attempts: 0, chats: 0, mastery: 0, cache: 0 });
    expect(await countsFor(survivor._id)).toEqual({ chunks: 1, flashcards: 1, quizzes: 1, attempts: 1, chats: 1, mastery: 1, cache: 1 });
    expect(await Document.exists({ _id: doomed._id })).toBeNull();
  });

  it("keeps the immutable ReviewLog (streak history) even though its flashcard set is gone", async () => {
    const { user, token } = await createUserWithToken();
    const doc = await seedDocument(user, "logged");
    await request(app).delete(`/api/documents/${doc._id}`).set("Authorization", `Bearer ${token}`);
    expect(await ReviewLog.countDocuments({ user: user._id })).toBe(1);
  });

  it("does not touch another user's data when deleting someone else's document id (404)", async () => {
    const { user } = await createUserWithToken();
    const { token: attackerToken } = await createUserWithToken();
    const doc = await seedDocument(user, "victim");

    const res = await request(app).delete(`/api/documents/${doc._id}`).set("Authorization", `Bearer ${attackerToken}`);
    expect(res.status).toBe(404);
    expect((await countsFor(doc._id)).chunks).toBe(1);
    expect(mongoose.Types.ObjectId.isValid(doc._id)).toBe(true);
  });
});
