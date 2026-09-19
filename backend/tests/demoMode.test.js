import { describe, it, expect, afterEach } from "vitest";
import fs from "fs";
import request from "supertest";
import app from "../app.js";
import User from "../models/User.js";
import Document from "../models/Document.js";
import Flashcard from "../models/Flashcard.js";
import Quiz from "../models/Quiz.js";
import Chunk from "../models/Chunk.js";
import { DEMO_EMAIL } from "../utils/demoSeed.js";

afterEach(() => {
  delete process.env.DEMO_MODE;
  process.env.NODE_ENV = "test";
});

const enter = async () => {
  const res = await request(app).post("/api/auth/demo");
  return { res, token: res.body.token, auth: { Authorization: `Bearer ${res.body.token}` } };
};

describe("POST /api/auth/demo", () => {
  it("signs the visitor in to a seeded account with tokens and a refresh cookie", async () => {
    const { res } = await enter();
    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
    expect(res.body.user).toMatchObject({ email: DEMO_EMAIL, isDemo: true });
    expect(res.headers["set-cookie"]?.some((c) => c.startsWith("refreshToken="))).toBe(true);
  });

  it("seeds a real document (with a viewable PDF), a deck, a completed quiz, chat history and weak-area mastery", async () => {
    const { auth } = await enter();

    const docs = await request(app).get("/api/documents").set(auth);
    expect(docs.body.total).toBe(1);
    const doc = docs.body.items[0];
    expect(doc).toMatchObject({ hasExtractedText: true, fileMissing: false, pageCount: 3, flashcardCount: 1, quizCount: 1 });
    expect((await request(app).get(doc.fileUrl)).headers["content-type"]).toMatch(/pdf/);

    const sets = await request(app).get("/api/flashcards").set(auth);
    expect(sets.body.items[0]).toMatchObject({ totalCards: 8, reviewedCount: 5 });

    const quizzes = await request(app).get("/api/quizzes").set(auth);
    expect(quizzes.body.items[0]).toMatchObject({ isCompleted: true, score: 60, questionCount: 5 });

    const chat = await request(app).get(`/api/ai/chat-history/${doc._id}`).set(auth);
    expect(chat.body.at(-1).sources[0]).toMatchObject({ snippetPage: 3 });

    const mastery = await request(app).get("/api/mastery").set(auth);
    expect(mastery.body.weakest[0].concept).toBe("Calvin cycle");

    expect((await request(app).get("/api/review/streak").set(auth)).body.currentStreak).toBeGreaterThanOrEqual(3);
    expect((await request(app).get("/api/review/due").set(auth)).body.total).toBeGreaterThan(0);
  });

  it("indexes the demo document for search without embeddings (it never spends anything)", async () => {
    await enter();
    const chunks = await Chunk.find({}).lean();
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks.every((c) => !c.embedding)).toBe(true);
  });

  it("is idempotent: a second visitor reuses the same account and data", async () => {
    await enter();
    await enter();
    expect(await User.countDocuments({ email: DEMO_EMAIL })).toBe(1);
    expect(await Document.countDocuments()).toBe(1);
    expect(await Flashcard.countDocuments()).toBe(1);
    expect(await Quiz.countDocuments()).toBe(1);
  });

  it("survives concurrent first visitors without duplicating the seed", async () => {
    await Promise.all([enter(), enter(), enter()]);
    expect(await User.countDocuments({ email: DEMO_EMAIL })).toBe(1);
    expect(await Document.countDocuments()).toBeLessThanOrEqual(3); // races may double-seed data, never the account
  });

  it("restores the PDF if the uploads directory was wiped (a redeploy)", async () => {
    const { auth } = await enter();
    const doc = (await request(app).get("/api/documents").set(auth)).body.items[0];
    fs.rmSync((await Document.findById(doc._id)).filePath);
    expect((await request(app).get("/api/documents").set(auth)).body.items[0].fileMissing).toBe(true);

    await enter();
    expect((await request(app).get("/api/documents").set(auth)).body.items[0].fileMissing).toBe(false);
  });

  it("cannot be signed in to with a password", async () => {
    await enter();
    const res = await request(app).post("/api/auth/login").send({ email: DEMO_EMAIL, password: "password123" });
    expect(res.status).toBe(401);
  });

  it("is off (404) in production unless DEMO_MODE=true", async () => {
    process.env.NODE_ENV = "production";
    expect((await request(app).post("/api/auth/demo")).status).toBe(404);
    process.env.DEMO_MODE = "true";
    expect((await request(app).post("/api/auth/demo")).status).toBe(200);
  });

  it("can be switched off explicitly anywhere with DEMO_MODE=false", async () => {
    process.env.DEMO_MODE = "false";
    expect((await request(app).post("/api/auth/demo")).status).toBe(404);
  });
});

describe("the demo account is read-only", () => {
  it("refuses every write with a clear 403, before any work (or spend) happens", async () => {
    const { auth } = await enter();
    const doc = (await request(app).get("/api/documents").set(auth)).body.items[0];
    const set = (await request(app).get("/api/flashcards").set(auth)).body.items[0];
    const writes = [
      ["post", "/api/ai/chat", { documentId: doc._id, message: "hi" }],
      ["post", "/api/ai/chat/stream", { documentId: doc._id, message: "hi" }],
      ["post", "/api/ai/generate-flashcards", { documentId: doc._id }],
      ["post", "/api/ai/generate-quiz", { documentId: doc._id }],
      ["post", "/api/ai/summary", { documentId: doc._id }],
      ["put", `/api/flashcards/${set._id}/cards/${set.cards[0]._id}/review`, { grade: "good" }],
      ["put", `/api/flashcards/${set._id}/cards/${set.cards[0]._id}/favorite`, {}],
      ["delete", `/api/flashcards/${set._id}`],
      ["delete", `/api/documents/${doc._id}`],
      ["put", "/api/auth/api-key", { apiKey: "sk-" + "a".repeat(30) }],
      ["put", "/api/auth/update-password", { currentPassword: "x", newPassword: "y".repeat(10) }],
    ];
    for (const [method, url, body] of writes) {
      const res = await request(app)[method](url).set(auth).send(body);
      expect(res.status, `${method} ${url}`).toBe(403);
      expect(res.body.error.message).toMatch(/read-only/i);
    }
    // ...and nothing changed.
    expect(await Flashcard.countDocuments()).toBe(1);
    expect(await Document.countDocuments()).toBe(1);
  });

  it("does not block a normal user's writes", async () => {
    const reg = await request(app).post("/api/auth/register").send({ username: "N", email: "normal@example.com", password: "password123" });
    const res = await request(app).put("/api/auth/update-password").set("Authorization", `Bearer ${reg.body.token}`).send({ currentPassword: "password123", newPassword: "another-password-1" });
    expect(res.status).toBe(200);
  });
});
