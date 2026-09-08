import { describe, it, expect } from "vitest";
import request from "supertest";
import app from "../app.js";
import Document from "../models/Document.js";
import Quiz from "../models/Quiz.js";
import QuizAttempt from "../models/QuizAttempt.js";
import { createUserWithToken } from "./helpers.js";

const createQuiz = async (userId, documentId) =>
  Quiz.create({
    user: userId,
    document: documentId,
    title: "Sample quiz",
    questions: [
      { question: "2+2?", options: ["3", "4"], correctAnswer: "4", explanation: "math" },
      { question: "Capital of France?", options: ["Paris", "Rome"], correctAnswer: "Paris", explanation: "geo" },
    ],
  });

describe("quiz grading with {questionId, answer} pairs", () => {
  it("grades correctly regardless of the order answers are submitted in", async () => {
    const { user, token } = await createUserWithToken();
    const doc = await Document.create({
      user: user._id,
      title: "Doc",
      fileName: "d.pdf",
      filePath: "/tmp/d.pdf",
      fileSize: 10,
      mimeType: "application/pdf",
      extractedText: "text",
      hasExtractedText: true,
    });
    const quiz = await createQuiz(user._id, doc._id);
    const [q1, q2] = quiz.questions;

    // Deliberately reversed order relative to how the questions are stored.
    const res = await request(app)
      .post(`/api/quizzes/${quiz._id}/submit`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        answers: [
          { questionId: q2._id, answer: "Paris" },
          { questionId: q1._id, answer: "4" },
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ total: 2, correct: 2, incorrect: 0, percentage: 100 });
  });

  it("rejects an answer for a question that isn't on the quiz", async () => {
    const { user, token } = await createUserWithToken();
    const doc = await Document.create({
      user: user._id,
      title: "Doc",
      fileName: "d2.pdf",
      filePath: "/tmp/d2.pdf",
      fileSize: 10,
      mimeType: "application/pdf",
      extractedText: "text",
      hasExtractedText: true,
    });
    const quiz = await createQuiz(user._id, doc._id);

    const res = await request(app)
      .post(`/api/quizzes/${quiz._id}/submit`)
      .set("Authorization", `Bearer ${token}`)
      .send({ answers: [{ questionId: "0".repeat(24), answer: "4" }] });

    expect(res.status).toBe(400);
  });

  it("records an immutable QuizAttempt alongside the quiz's own latest state", async () => {
    const { user, token } = await createUserWithToken();
    const doc = await Document.create({
      user: user._id,
      title: "Doc",
      fileName: "d3.pdf",
      filePath: "/tmp/d3.pdf",
      fileSize: 10,
      mimeType: "application/pdf",
      extractedText: "text",
      hasExtractedText: true,
    });
    const quiz = await createQuiz(user._id, doc._id);
    const [q1, q2] = quiz.questions;

    await request(app)
      .post(`/api/quizzes/${quiz._id}/submit`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        answers: [
          { questionId: q1._id, answer: "3" },
          { questionId: q2._id, answer: "Paris" },
        ],
      });

    const attempts = await QuizAttempt.find({ quiz: quiz._id });
    expect(attempts).toHaveLength(1);
    expect(attempts[0]).toMatchObject({ user: user._id, total: 2, correct: 1, score: 50 });
  });

  it("still blocks a second submission of the same quiz", async () => {
    const { user, token } = await createUserWithToken();
    const doc = await Document.create({
      user: user._id,
      title: "Doc",
      fileName: "d4.pdf",
      filePath: "/tmp/d4.pdf",
      fileSize: 10,
      mimeType: "application/pdf",
      extractedText: "text",
      hasExtractedText: true,
    });
    const quiz = await createQuiz(user._id, doc._id);
    const answers = quiz.questions.map((q) => ({ questionId: q._id, answer: q.correctAnswer }));

    await request(app).post(`/api/quizzes/${quiz._id}/submit`).set("Authorization", `Bearer ${token}`).send({ answers });
    const second = await request(app)
      .post(`/api/quizzes/${quiz._id}/submit`)
      .set("Authorization", `Bearer ${token}`)
      .send({ answers });

    expect(second.status).toBe(409);
  });

  it("results page reflects per-question correctness after grading", async () => {
    const { user, token } = await createUserWithToken();
    const doc = await Document.create({
      user: user._id,
      title: "Doc",
      fileName: "d5.pdf",
      filePath: "/tmp/d5.pdf",
      fileSize: 10,
      mimeType: "application/pdf",
      extractedText: "text",
      hasExtractedText: true,
    });
    const quiz = await createQuiz(user._id, doc._id);
    const [q1, q2] = quiz.questions;

    await request(app)
      .post(`/api/quizzes/${quiz._id}/submit`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        answers: [
          { questionId: q1._id, answer: "3" },
          { questionId: q2._id, answer: "Paris" },
        ],
      });

    const res = await request(app).get(`/api/quizzes/${quiz._id}/results`).set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.correct).toBe(1);
    expect(res.body.questions[0]).toMatchObject({ userAnswer: "3", correctAnswer: "4", isCorrect: false });
    expect(res.body.questions[1]).toMatchObject({ userAnswer: "Paris", correctAnswer: "Paris", isCorrect: true });
  });
});
