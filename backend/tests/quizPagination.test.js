import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import app from "../app.js";
import Document from "../models/Document.js";
import Quiz from "../models/Quiz.js";
import { createUserWithToken } from "./helpers.js";

describe("GET /api/quizzes pagination", () => {
  let token;
  let documentId;

  beforeEach(async () => {
    const { user, token: userToken } = await createUserWithToken();
    token = userToken;

    const doc = await Document.create({
      user: user._id,
      title: "Source Document",
      fileName: "source.pdf",
      filePath: "/tmp/source.pdf",
      fileSize: 10,
      mimeType: "application/pdf",
      extractedText: "content",
      hasExtractedText: true,
    });
    documentId = doc._id;

    const quizzes = Array.from({ length: 5 }, (_, i) => ({
      user: user._id,
      document: doc._id,
      title: `Quiz ${i}`,
      questions: [
        {
          question: "Capital of France?",
          options: ["Paris", "London", "Rome", "Berlin"],
          correctAnswer: "Paris",
          explanation: "Paris is the capital of France",
        },
      ],
    }));
    await Quiz.insertMany(quizzes);
  });

  it("defaults to page 1, includes the document title and a question count, and never leaks the answer key", async () => {
    const res = await request(app).get("/api/quizzes").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(5);
    expect(res.body.page).toBe(1);
    expect(res.body.total).toBe(5);

    const [item] = res.body.items;
    expect(item.document._id).toBe(documentId.toString());
    expect(item.document.title).toBe("Source Document");
    expect(item.questionCount).toBe(1);
    expect(item.questions).toBeUndefined();
    expect(JSON.stringify(res.body)).not.toContain("correctAnswer");
  });

  it("respects limit and page query params", async () => {
    const res = await request(app).get("/api/quizzes?page=2&limit=2").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(2);
    expect(res.body.page).toBe(2);
    expect(res.body.totalPages).toBe(3);
  });
});
