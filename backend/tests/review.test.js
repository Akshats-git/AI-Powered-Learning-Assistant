import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import app from "../app.js";
import Document from "../models/Document.js";
import Flashcard from "../models/Flashcard.js";
import ReviewLog from "../models/ReviewLog.js";
import { createUserWithToken } from "./helpers.js";

const makeDocument = async (userId, title = "Source Document") =>
  Document.create({
    user: userId,
    title,
    fileName: "source.pdf",
    filePath: "/tmp/source.pdf",
    fileSize: 10,
    mimeType: "application/pdf",
    extractedText: "content",
    hasExtractedText: true,
  });

const makeSet = async (userId, documentId, cards) =>
  Flashcard.create({
    user: userId,
    document: documentId,
    title: "Set",
    cards,
  });

describe("PUT /:setId/cards/:cardId/review", () => {
  let token;
  let user;
  let set;

  beforeEach(async () => {
    ({ user, token } = await createUserWithToken());
    const document = await makeDocument(user._id);
    set = await makeSet(user._id, document._id, [{ question: "Q1", answer: "A1" }]);
  });

  it("schedules the card with FSRS, marks it reviewed, and returns updated progress", async () => {
    const cardId = set.cards[0]._id;
    const res = await request(app)
      .put(`/api/flashcards/${set._id}/cards/${cardId}/review`)
      .set("Authorization", `Bearer ${token}`)
      .send({ grade: "good" });

    expect(res.status).toBe(200);
    const updatedCard = res.body.cards.find((c) => c._id === cardId.toString());
    expect(updatedCard.isReviewed).toBe(true);
    expect(updatedCard.schedule.reps).toBe(1);
    expect(updatedCard.schedule.stability).toBeGreaterThan(0);
    expect(new Date(updatedCard.schedule.dueDate).getTime()).toBeGreaterThan(Date.now());
    expect(res.body.reviewedCount).toBe(1);
  });

  it("writes an immutable ReviewLog row for every grade", async () => {
    const cardId = set.cards[0]._id;
    await request(app)
      .put(`/api/flashcards/${set._id}/cards/${cardId}/review`)
      .set("Authorization", `Bearer ${token}`)
      .send({ grade: "easy" });

    const logs = await ReviewLog.find({ user: user._id, cardId });
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ algorithm: "fsrs", grade: "easy" });
    expect(logs[0].stateAfter.reps).toBe(1);
  });

  it("accumulates scheduling state across repeated reviews of the same card", async () => {
    const cardId = set.cards[0]._id;
    const review = (grade) =>
      request(app).put(`/api/flashcards/${set._id}/cards/${cardId}/review`).set("Authorization", `Bearer ${token}`).send({ grade });

    await review("good");
    const second = await review("good");

    const card = second.body.cards.find((c) => c._id === cardId.toString());
    expect(card.schedule.reps).toBe(2);

    const logs = await ReviewLog.find({ cardId }).sort({ reviewedAt: 1 });
    expect(logs).toHaveLength(2);
  });

  it("rejects an invalid grade with a 400 validation error", async () => {
    const cardId = set.cards[0]._id;
    const res = await request(app)
      .put(`/api/flashcards/${set._id}/cards/${cardId}/review`)
      .set("Authorization", `Bearer ${token}`)
      .send({ grade: "excellent" });

    expect(res.status).toBe(400);
    expect(await ReviewLog.countDocuments({})).toBe(0);
  });

  it("404s for a card that doesn't exist in the set", async () => {
    const res = await request(app)
      .put(`/api/flashcards/${set._id}/cards/${set._id}/review`) // reuse the set's own id — a valid ObjectId, not a real card id
      .set("Authorization", `Bearer ${token}`)
      .send({ grade: "good" });

    expect(res.status).toBe(404);
  });
});

describe("GET /api/review/due", () => {
  it("includes a brand-new, never-reviewed card immediately", async () => {
    const { user, token } = await createUserWithToken();
    const document = await makeDocument(user._id);
    await makeSet(user._id, document._id, [{ question: "Q1", answer: "A1" }]);

    const res = await request(app).get("/api/review/due").set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].isNew).toBe(true);
  });

  it("excludes a card scheduled for the future", async () => {
    const { user, token } = await createUserWithToken();
    const document = await makeDocument(user._id);
    const set = await makeSet(user._id, document._id, [{ question: "Q1", answer: "A1" }]);
    const cardId = set.cards[0]._id;

    // Not due yet.
    await request(app)
      .put(`/api/flashcards/${set._id}/cards/${cardId}/review`)
      .set("Authorization", `Bearer ${token}`)
      .send({ grade: "easy" });

    const res = await request(app).get("/api/review/due").set("Authorization", `Bearer ${token}`);
    expect(res.body.items).toHaveLength(0);
  });

  it("interleaves cards due across multiple documents, oldest-due first", async () => {
    const { user, token } = await createUserWithToken();
    const docA = await makeDocument(user._id, "Doc A");
    const docB = await makeDocument(user._id, "Doc B");
    const setA = await makeSet(user._id, docA._id, [{ question: "A-Q1", answer: "A-A1" }]);
    const setB = await makeSet(user._id, docB._id, [{ question: "B-Q1", answer: "B-A1" }]);

    // Backdate setA's card so it's clearly the older overdue item.
    await Flashcard.updateOne(
      { _id: setA._id, "cards._id": setA.cards[0]._id },
      { $set: { "cards.$.schedule.dueDate": new Date(Date.now() - 5 * 24 * 60 * 60 * 1000) } }
    );
    await Flashcard.updateOne(
      { _id: setB._id, "cards._id": setB.cards[0]._id },
      { $set: { "cards.$.schedule.dueDate": new Date(Date.now() - 1 * 24 * 60 * 60 * 1000) } }
    );

    const res = await request(app).get("/api/review/due").set("Authorization", `Bearer ${token}`);

    expect(res.body.items).toHaveLength(2);
    expect(res.body.items[0].question).toBe("A-Q1");
    expect(res.body.items[1].question).toBe("B-Q1");
    expect(res.body.total).toBe(2);
  });

  it("respects the limit query param", async () => {
    const { user, token } = await createUserWithToken();
    const document = await makeDocument(user._id);
    await makeSet(
      user._id,
      document._id,
      Array.from({ length: 5 }, (_, i) => ({ question: `Q${i}`, answer: `A${i}` }))
    );

    const res = await request(app).get("/api/review/due?limit=2").set("Authorization", `Bearer ${token}`);
    expect(res.body.items).toHaveLength(2);
    expect(res.body.total).toBe(5);
  });

  it("still surfaces a legacy card with no schedule field at all (pre-migration data)", async () => {
    const { user, token } = await createUserWithToken();
    const document = await makeDocument(user._id);
    const set = await makeSet(user._id, document._id, [{ question: "Legacy Q", answer: "Legacy A" }]);

    await Flashcard.updateOne({ _id: set._id, "cards._id": set.cards[0]._id }, { $unset: { "cards.$.schedule": "" } });

    const res = await request(app).get("/api/review/due").set("Authorization", `Bearer ${token}`);
    expect(res.body.items.map((i) => i.question)).toContain("Legacy Q");
  });

  it("only returns the requesting user's own due cards", async () => {
    const { user, token } = await createUserWithToken();
    const { user: otherUser } = await createUserWithToken();
    const document = await makeDocument(otherUser._id);
    await makeSet(otherUser._id, document._id, [{ question: "Not mine", answer: "A" }]);

    const res = await request(app).get("/api/review/due").set("Authorization", `Bearer ${token}`);
    expect(res.body.items).toHaveLength(0);
    void user;
  });
});

describe("GET /api/review/forecast/:setId", () => {
  it("returns a 91-point retention curve for a deck with reviewed cards", async () => {
    const { user, token } = await createUserWithToken();
    const document = await makeDocument(user._id);
    const set = await makeSet(user._id, document._id, [{ question: "Q1", answer: "A1" }]);
    const cardId = set.cards[0]._id;

    await request(app)
      .put(`/api/flashcards/${set._id}/cards/${cardId}/review`)
      .set("Authorization", `Bearer ${token}`)
      .send({ grade: "good" });

    const res = await request(app).get(`/api/review/forecast/${set._id}`).set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.points).toHaveLength(91);
    expect(res.body.points[0].avgRetention).toBeGreaterThan(0.9);
  });

  it("404s for another user's flashcard set", async () => {
    const { user } = await createUserWithToken();
    const { token: otherToken } = await createUserWithToken();
    const document = await makeDocument(user._id);
    const set = await makeSet(user._id, document._id, [{ question: "Q1", answer: "A1" }]);

    const res = await request(app).get(`/api/review/forecast/${set._id}`).set("Authorization", `Bearer ${otherToken}`);
    expect(res.status).toBe(404);
  });
});

describe("GET /api/review/streak", () => {
  it("returns a zero streak for a user with no review history", async () => {
    const { token } = await createUserWithToken();
    const res = await request(app).get("/api/review/streak").set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ currentStreak: 0, longestStreak: 0, activeToday: false });
  });

  it("counts today's review as a streak of 1", async () => {
    const { user, token } = await createUserWithToken();
    const document = await makeDocument(user._id);
    const set = await makeSet(user._id, document._id, [{ question: "Q1", answer: "A1" }]);

    await request(app)
      .put(`/api/flashcards/${set._id}/cards/${set.cards[0]._id}/review`)
      .set("Authorization", `Bearer ${token}`)
      .send({ grade: "good" });

    const res = await request(app).get("/api/review/streak").set("Authorization", `Bearer ${token}`);
    expect(res.body).toMatchObject({ currentStreak: 1, activeToday: true });
  });
});
