import { describe, it, expect } from "vitest";
import request from "supertest";
import app from "../app.js";
import Document from "../models/Document.js";
import Flashcard from "../models/Flashcard.js";
import Quiz from "../models/Quiz.js";
import ChatHistory from "../models/ChatHistory.js";
import { createUserWithToken } from "./helpers.js";

const seed = async (user, label = "Mitochondria") => {
  const doc = await Document.create({ user: user._id, title: `${label} Notes`, fileName: "n.pdf", filePath: "/tmp/n.pdf", fileSize: 1, mimeType: "application/pdf", extractedText: "t" });
  await Flashcard.create({ user: user._id, document: doc._id, title: "Cell deck", cards: [{ question: `What do ${label} produce?`, answer: "ATP, via oxidative phosphorylation." }, { question: "Unrelated?", answer: "No." }] });
  await Quiz.create({ user: user._id, document: doc._id, title: "Cell quiz", questions: [{ question: `Where are ${label} found?`, options: ["a", "b", "c", "d"], correctAnswer: "SECRET-KEY", explanation: "SECRET-EXPLANATION" }] });
  await ChatHistory.create({ user: user._id, document: doc._id, messages: [{ role: "user", content: `Tell me about ${label}` }, { role: "assistant", content: `${label} are the powerhouse of the cell, producing ATP for energy.` }] });
  return doc;
};

const get = (token, q) => request(app).get("/api/search").query({ q }).set("Authorization", `Bearer ${token}`);

describe("GET /api/search", () => {
  it("finds the caller's documents, decks (by title and by card text), quizzes and chat, grouped", async () => {
    const { user, token } = await createUserWithToken();
    await seed(user);

    const res = await get(token, "mitochondria");
    expect(res.status).toBe(200);
    expect(res.body.documents).toHaveLength(1);
    expect(res.body.documents[0].title).toBe("Mitochondria Notes");
    expect(res.body.flashcards[0].card.question).toMatch(/Mitochondria produce/);
    expect(res.body.quizzes[0].question).toMatch(/Where are Mitochondria found/);
    expect(res.body.chats[0]).toMatchObject({ documentTitle: "Mitochondria Notes", role: "user" });
  });

  it("matches card ANSWERS too, and shows a snippet around the match", async () => {
    const { user, token } = await createUserWithToken();
    await seed(user);
    const res = await get(token, "oxidative");
    expect(res.body.flashcards[0].card.snippet).toContain("oxidative phosphorylation");
  });

  it("is case-insensitive", async () => {
    const { user, token } = await createUserWithToken();
    await seed(user);
    expect((await get(token, "MITOCHONDRIA")).body.documents).toHaveLength(1);
  });

  it("NEVER searches or returns a quiz's answer key or explanations", async () => {
    const { user, token } = await createUserWithToken();
    await seed(user);
    const bySecret = await get(token, "SECRET");
    expect(bySecret.body.quizzes).toHaveLength(0);
    const normal = await get(token, "mitochondria");
    expect(JSON.stringify(normal.body)).not.toMatch(/SECRET/);
  });

  it("never returns another user's data", async () => {
    const a = await createUserWithToken();
    const b = await createUserWithToken();
    await seed(a.user, "Zebrafish");
    const res = await get(b.token, "zebrafish");
    expect(res.body).toMatchObject({ documents: [], flashcards: [], quizzes: [], chats: [] });
  });

  it("treats the query literally: regex metacharacters neither match everything nor throw", async () => {
    const { user, token } = await createUserWithToken();
    await seed(user);
    for (const q of [".*", "(", "a|b", "[x", "\\", "(a+)+$"]) {
      const res = await get(token, q.length < 2 ? `${q}${q}` : q);
      expect(res.status, q).toBe(200);
      expect(res.body.documents, q).toHaveLength(0);
    }
  });

  it("limits each group to 5", async () => {
    const { user, token } = await createUserWithToken();
    for (let i = 0; i < 8; i += 1) await Document.create({ user: user._id, title: `Alpha ${i}`, fileName: "n.pdf", filePath: "/tmp/n.pdf", fileSize: 1, mimeType: "application/pdf", extractedText: "t" });
    expect((await get(token, "alpha")).body.documents).toHaveLength(5);
  });

  it("rejects a too-short or too-long query, and requires auth", async () => {
    const { token } = await createUserWithToken();
    expect((await get(token, "a")).status).toBe(400);
    expect((await get(token, "x".repeat(101))).status).toBe(400);
    expect((await request(app).get("/api/search?q=hello")).status).toBe(401);
  });
});
