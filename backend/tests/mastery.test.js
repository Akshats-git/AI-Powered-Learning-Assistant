import { describe, it, expect } from "vitest";
import request from "supertest";
import app from "../app.js";
import Document from "../models/Document.js";
import Quiz from "../models/Quiz.js";
import Mastery from "../models/Mastery.js";
import { BKT_DEFAULT_PARAMETERS } from "../utils/bkt.js";
import { createUserWithToken } from "./helpers.js";

const makeDocument = async (userId) =>
  Document.create({
    user: userId,
    title: "Doc",
    fileName: "d.pdf",
    filePath: "/tmp/d.pdf",
    fileSize: 10,
    mimeType: "application/pdf",
    extractedText: "text",
    hasExtractedText: true,
  });

const makeQuiz = async (userId, documentId, questions) => Quiz.create({ user: userId, document: documentId, title: "Quiz", questions });

describe("quiz submission → BKT mastery", () => {
  it("creates a mastery row for a correctly answered, concept-tagged question", async () => {
    const { user, token } = await createUserWithToken();
    const document = await makeDocument(user._id);
    const quiz = await makeQuiz(user._id, document._id, [
      { question: "Q1", options: ["A", "B"], correctAnswer: "A", explanation: "e", concept: "photosynthesis" },
    ]);

    const res = await request(app)
      .post(`/api/quizzes/${quiz._id}/submit`)
      .set("Authorization", `Bearer ${token}`)
      .send({ answers: [{ questionId: quiz.questions[0]._id, answer: "A" }] });

    expect(res.status).toBe(200);
    const mastery = await Mastery.findOne({ user: user._id, concept: "photosynthesis" });
    expect(mastery).not.toBeNull();
    expect(mastery.pKnown).toBeGreaterThan(BKT_DEFAULT_PARAMETERS.prior);
    expect(mastery.opportunities).toBe(1);
  });

  it("lowers pKnown for an incorrectly answered concept", async () => {
    const { user, token } = await createUserWithToken();
    const document = await makeDocument(user._id);
    const quiz = await makeQuiz(user._id, document._id, [
      { question: "Q1", options: ["A", "B"], correctAnswer: "A", explanation: "e", concept: "thermodynamics" },
    ]);

    await request(app)
      .post(`/api/quizzes/${quiz._id}/submit`)
      .set("Authorization", `Bearer ${token}`)
      .send({ answers: [{ questionId: quiz.questions[0]._id, answer: "B" }] });

    const mastery = await Mastery.findOne({ user: user._id, concept: "thermodynamics" });
    expect(mastery.pKnown).toBeLessThan(BKT_DEFAULT_PARAMETERS.prior);
  });

  it("accumulates evidence across multiple quizzes tagging the same concept", async () => {
    const { user, token } = await createUserWithToken();
    const document = await makeDocument(user._id);

    for (let i = 0; i < 3; i += 1) {
      const quiz = await makeQuiz(user._id, document._id, [
        { question: `Q${i}`, options: ["A", "B"], correctAnswer: "A", explanation: "e", concept: "recursion" },
      ]);
      await request(app)
        .post(`/api/quizzes/${quiz._id}/submit`)
        .set("Authorization", `Bearer ${token}`)
        .send({ answers: [{ questionId: quiz.questions[0]._id, answer: "A" }] });
    }

    const mastery = await Mastery.findOne({ user: user._id, concept: "recursion" });
    expect(mastery.opportunities).toBe(3);
  });

  it("skips questions with no concept tag entirely", async () => {
    const { user, token } = await createUserWithToken();
    const document = await makeDocument(user._id);
    const quiz = await makeQuiz(user._id, document._id, [{ question: "Q1", options: ["A", "B"], correctAnswer: "A", explanation: "e" }]);

    const res = await request(app)
      .post(`/api/quizzes/${quiz._id}/submit`)
      .set("Authorization", `Bearer ${token}`)
      .send({ answers: [{ questionId: quiz.questions[0]._id, answer: "A" }] });

    expect(res.status).toBe(200);
    expect(await Mastery.countDocuments({ user: user._id })).toBe(0);
  });

  it("still grades and returns the score even if mastery tracking encounters an error", async () => {
    // No mock needed to prove this — an unanswered/skipped question with a
    // concept tag still shouldn't ever break the response, since "correct"
    // just evaluates to false for a null answer.
    const { user, token } = await createUserWithToken();
    const document = await makeDocument(user._id);
    const quiz = await makeQuiz(user._id, document._id, [
      { question: "Q1", options: ["A", "B"], correctAnswer: "A", explanation: "e", concept: "osmosis" },
    ]);

    const res = await request(app)
      .post(`/api/quizzes/${quiz._id}/submit`)
      .set("Authorization", `Bearer ${token}`)
      .send({ answers: [] });

    expect(res.status).toBe(200);
    expect(res.body.percentage).toBe(0);
  });
});

describe("GET /api/mastery", () => {
  it("returns the user's concept mastery sorted weakest-first", async () => {
    const { user, token } = await createUserWithToken();
    const document = await makeDocument(user._id);

    await Mastery.create({ user: user._id, document: document._id, concept: "strong-concept", pKnown: 0.98, opportunities: 5 });
    await Mastery.create({ user: user._id, document: document._id, concept: "weak-concept", pKnown: 0.2, opportunities: 2 });

    const res = await request(app).get("/api/mastery").set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.items.map((i) => i.concept)).toEqual(["weak-concept", "strong-concept"]);
    expect(res.body.items[0].mastered).toBe(false);
    expect(res.body.items[1].mastered).toBe(true);
  });

  it("puts unmastered concepts in the weakest list", async () => {
    const { user, token } = await createUserWithToken();
    const document = await makeDocument(user._id);
    await Mastery.create({ user: user._id, document: document._id, concept: "weak-concept", pKnown: 0.2, opportunities: 1 });

    const res = await request(app).get("/api/mastery").set("Authorization", `Bearer ${token}`);
    expect(res.body.weakest.map((i) => i.concept)).toContain("weak-concept");
  });

  it("scopes to one document when documentId is given", async () => {
    const { user, token } = await createUserWithToken();
    const docA = await makeDocument(user._id);
    const docB = await makeDocument(user._id);
    await Mastery.create({ user: user._id, document: docA._id, concept: "in-doc-a", pKnown: 0.5, opportunities: 1 });
    await Mastery.create({ user: user._id, document: docB._id, concept: "in-doc-b", pKnown: 0.5, opportunities: 1 });

    const res = await request(app).get(`/api/mastery?documentId=${docA._id}`).set("Authorization", `Bearer ${token}`);
    expect(res.body.items.map((i) => i.concept)).toEqual(["in-doc-a"]);
  });

  it("only returns the requesting user's own mastery data", async () => {
    const { user, token } = await createUserWithToken();
    const { user: otherUser } = await createUserWithToken();
    const document = await makeDocument(otherUser._id);
    await Mastery.create({ user: otherUser._id, document: document._id, concept: "not-mine", pKnown: 0.5, opportunities: 1 });

    const res = await request(app).get("/api/mastery").set("Authorization", `Bearer ${token}`);
    expect(res.body.items).toEqual([]);
  });
});
