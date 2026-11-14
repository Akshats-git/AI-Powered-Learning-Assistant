import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import request from "supertest";
import app from "../app.js";
import User from "../models/User.js";
import Document from "../models/Document.js";
import Flashcard from "../models/Flashcard.js";
import Quiz from "../models/Quiz.js";
import QuizAttempt from "../models/QuizAttempt.js";
import ChatHistory from "../models/ChatHistory.js";
import Chunk from "../models/Chunk.js";
import Mastery from "../models/Mastery.js";
import { UPLOAD_DIR } from "../middlewares/uploadMiddleware.js";
import { createUserWithToken } from "./helpers.js";

const SAMPLE_PDF = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../e2e/tests/fixtures/sample.pdf");
const auth = (t) => ({ Authorization: `Bearer ${t}` });
const makeDoc = (user, title = "Doc") =>
  Document.create({ user, title, fileName: "d.pdf", filePath: "/tmp/none.pdf", fileSize: 1, mimeType: "application/pdf", extractedText: "text", hasExtractedText: true });

describe("rename document", () => {
  it("renames, trims, validates, and only for the owner", async () => {
    const a = await createUserWithToken();
    const b = await createUserWithToken();
    const doc = await makeDoc(a.user._id, "Old");

    const ok = await request(app).patch(`/api/documents/${doc._id}`).set(auth(a.token)).send({ title: "  New name  " });
    expect(ok.status).toBe(200);
    expect(ok.body.title).toBe("New name");
    expect(ok.body.extractedText).toBeUndefined();

    expect((await request(app).patch(`/api/documents/${doc._id}`).set(auth(a.token)).send({ title: "   " })).status).toBe(400);
    expect((await request(app).patch(`/api/documents/${doc._id}`).set(auth(a.token)).send({ title: "x".repeat(201) })).status).toBe(400);
    expect((await request(app).patch(`/api/documents/${doc._id}`).set(auth(b.token)).send({ title: "Mine now" })).status).toBe(404);
    expect((await Document.findById(doc._id)).title).toBe("New name");
  });
});

describe("retake quiz", () => {
  const makeQuiz = (user, doc, done) =>
    Quiz.create({ user, document: doc, title: "Q", isCompleted: done, score: done ? 50 : 0, userAnswers: done ? [] : [], questions: [{ question: "2+2?", options: ["3", "4"], correctAnswer: "4", explanation: "m", concept: "math" }] });

  it("clones a finished quiz as a fresh unanswered one, hiding the key, leaving the original intact", async () => {
    const { user, token } = await createUserWithToken();
    const doc = await makeDoc(user._id);
    const original = await makeQuiz(user._id, doc._id, true);

    const res = await request(app).post(`/api/quizzes/${original._id}/retake`).set(auth(token));
    expect(res.status).toBe(201);
    expect(res.body._id).not.toBe(String(original._id));
    expect(res.body.isCompleted).toBe(false);
    expect(res.body.questions[0].correctAnswer).toBeUndefined();

    const copy = await Quiz.findById(res.body._id);
    expect(copy.questions[0].correctAnswer).toBe("4");
    expect((await Quiz.findById(original._id)).isCompleted).toBe(true);
  });

  it("refuses an unfinished quiz, and someone else's", async () => {
    const a = await createUserWithToken();
    const b = await createUserWithToken();
    const doc = await makeDoc(a.user._id);
    const open = await makeQuiz(a.user._id, doc._id, false);
    const done = await makeQuiz(a.user._id, doc._id, true);
    expect((await request(app).post(`/api/quizzes/${open._id}/retake`).set(auth(a.token))).status).toBe(400);
    expect((await request(app).post(`/api/quizzes/${done._id}/retake`).set(auth(b.token))).status).toBe(404);
  });
});

describe("export and delete account", () => {
  const seed = async (user) => {
    const up = await request(app).post("/api/documents/upload").set(auth((await tokenFor(user)))).field("title", "Seeded").attach("file", SAMPLE_PDF);
    const docId = up.body._id;
    await Flashcard.create({ user: user._id, document: docId, title: "Deck", cards: [{ question: "q", answer: "a" }] });
    await Quiz.create({ user: user._id, document: docId, title: "Quiz", questions: [{ question: "q", options: ["a", "b"], correctAnswer: "a" }] });
    await ChatHistory.create({ user: user._id, document: docId, messages: [{ role: "user", content: "hello" }] });
    await Mastery.create({ user: user._id, document: docId, concept: "c" });
    return up.body;
  };
  const tokenFor = async (user) => (await import("../utils/generateToken.js")).generateAccessToken(user._id);

  it("exports the caller's data without secrets or other users' data", async () => {
    const a = await createUserWithToken();
    const b = await createUserWithToken();
    await seed(a.user);
    await makeDoc(b.user._id, "Not yours");

    const res = await request(app).get("/api/auth/export").set(auth(a.token));
    expect(res.status).toBe(200);
    expect(res.headers["content-disposition"]).toMatch(/attachment/);
    const data = JSON.parse(res.text);
    expect(data.profile.email).toBe(a.user.email);
    expect(data.documents.map((d) => d.title)).toEqual(["Seeded"]);
    expect(data.flashcardSets).toHaveLength(1);
    expect(data.quizzes[0].questions[0].correctAnswer).toBe("a");
    expect(data.chats[0].messages[0].content).toBe("hello");
    expect(res.text).not.toMatch(/password|openaiApiKeyEncrypted|extractedText/);
    expect(res.text).not.toContain("Not yours");
  });

  it("deletes the account and everything of theirs, but nothing of anyone else's", async () => {
    const a = await createUserWithToken({ password: "password123" });
    const b = await createUserWithToken();
    const doc = await seed(a.user);
    const bDoc = await makeDoc(b.user._id, "Keep me");
    await Chunk.create({ user: b.user._id, document: bDoc._id, index: 0, text: "t", charStart: 0, charEnd: 1, tokens: 1, contentHash: "h" });
    expect(fs.existsSync(path.join(UPLOAD_DIR, doc.fileName))).toBe(true);

    const res = await request(app).delete("/api/auth/account").set(auth(a.token)).send({ password: "password123" });
    expect(res.status).toBe(200);

    expect(await User.findById(a.user._id)).toBeNull();
    for (const Model of [Document, Flashcard, Quiz, QuizAttempt, ChatHistory, Chunk, Mastery]) {
      expect(await Model.countDocuments({ user: a.user._id })).toBe(0);
    }
    expect(fs.existsSync(path.join(UPLOAD_DIR, doc.fileName))).toBe(false);

    expect(await User.findById(b.user._id)).not.toBeNull();
    expect(await Document.countDocuments({ user: b.user._id })).toBe(1);
    expect(await Chunk.countDocuments({ user: b.user._id })).toBe(1);
  });

  it("refuses without the right password, and changes nothing", async () => {
    const a = await createUserWithToken({ password: "password123" });
    await makeDoc(a.user._id);
    expect((await request(app).delete("/api/auth/account").set(auth(a.token)).send({ password: "wrong" })).status).toBe(401);
    expect((await request(app).delete("/api/auth/account").set(auth(a.token)).send({})).status).toBe(400);
    expect(await User.findById(a.user._id)).not.toBeNull();
    expect(await Document.countDocuments({ user: a.user._id })).toBe(1);
  });

  it("is not available to the shared demo account", async () => {
    const demo = await createUserWithToken();
    await User.updateOne({ _id: demo.user._id }, { isDemo: true });
    const res = await request(app).delete("/api/auth/account").set(auth(demo.token)).send({ password: "password123" });
    expect(res.status).toBe(403);
    expect(await User.findById(demo.user._id)).not.toBeNull();
  });
});
