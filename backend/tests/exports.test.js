import { describe, it, expect } from "vitest";
import request from "supertest";
import app from "../app.js";
import Document from "../models/Document.js";
import Flashcard from "../models/Flashcard.js";
import Quiz from "../models/Quiz.js";
import { flashcardsToCsv, flashcardsToAnki, safeFilename, quizResultsToMarkdown } from "../utils/exporters.js";
import { createUserWithToken } from "./helpers.js";

describe("flashcardsToCsv", () => {
  it("writes a header row and one row per card, with a BOM so Excel reads UTF-8", () => {
    const csv = flashcardsToCsv([{ question: "Q1?", answer: "A1", difficulty: "easy", isFavorite: true }]);
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv.split("\r\n").slice(0, 2)).toEqual(["﻿question,answer,difficulty,favorite", "Q1?,A1,easy,yes"]);
  });

  it("quotes commas, quotes and newlines correctly (RFC 4180)", () => {
    const csv = flashcardsToCsv([{ question: 'Say "hi", then\nleave', answer: "ok", difficulty: "medium" }]);
    expect(csv).toContain('"Say ""hi"", then\nleave",ok,medium,no');
  });

  it("defuses spreadsheet formulas in AI-generated text (CSV injection)", () => {
    const csv = flashcardsToCsv([
      { question: '=HYPERLINK("http://evil","x")', answer: "+1+1", difficulty: "hard" },
      { question: "-2+3", answer: "@SUM(A1)", difficulty: "hard" },
    ]);
    const rows = csv.split("\r\n");
    expect(rows[1]).toBe(`"'=HYPERLINK(""http://evil"",""x"")",'+1+1,hard,no`);
    expect(rows[2]).toBe("'-2+3,'@SUM(A1),hard,no");
  });
});

describe("flashcardsToAnki", () => {
  it("emits Anki's text-import header and tab-separated notes with a difficulty tag", () => {
    const out = flashcardsToAnki([{ question: "Q?", answer: "A", difficulty: "hard" }], "My deck");
    expect(out.split("\n").slice(0, 5)).toEqual(["#separator:tab", "#html:true", "#deck:My deck", "#tags column:3", "Q?\tA\tdifficulty::hard"]);
  });

  it("keeps a multi-line or tabbed answer on one row", () => {
    const out = flashcardsToAnki([{ question: "Q", answer: "line1\nline2\twith tab", difficulty: "easy" }], "d");
    expect(out).toContain("Q\tline1<br>line2 with tab\tdifficulty::easy");
  });
});

describe("safeFilename", () => {
  it("strips path and header-breaking characters", () => {
    expect(safeFilename('../../etc/passwd "x"\r\n', "csv")).not.toMatch(/[\/\\"\r\n]/);
    expect(safeFilename("Biology & Math: Ch. 4", "csv")).toBe("Biology-Math-Ch.-4.csv");
    expect(safeFilename("", "txt")).toBe("export.txt");
  });
});

describe("quizResultsToMarkdown", () => {
  it("marks the correct answer, the wrong pick, and unanswered questions", () => {
    const md = quizResultsToMarkdown({
      title: "Quiz", percentage: 50, correct: 1, total: 2,
      questions: [
        { question: "Q1", options: ["a", "b"], correctAnswer: "a", userAnswer: "b", explanation: "Because a." },
        { question: "Q2", options: ["c", "d"], correctAnswer: "d", userAnswer: null, explanation: "" },
      ],
    });
    expect(md).toContain("**Score:** 50% (1 of 2 correct)");
    expect(md).toContain("- a  — ✅ correct");
    expect(md).toContain("- b  — ❌ your answer");
    expect(md).toContain("_Not answered._");
    expect(md).toContain("> Because a.");
  });
});

const seed = async () => {
  const { user, token } = await createUserWithToken();
  const document = await Document.create({ user: user._id, title: "D", fileName: "d.pdf", filePath: "/tmp/d.pdf", fileSize: 1, mimeType: "application/pdf", extractedText: "t", hasExtractedText: true });
  const set = await Flashcard.create({ user: user._id, document: document._id, title: "Cell Biology: Ch. 1", cards: [{ question: "Q1?", answer: "A1", difficulty: "easy" }, { question: "=cmd", answer: "A2" }] });
  return { user, token, document, set };
};

describe("GET /api/flashcards/:setId/export", () => {
  it("downloads CSV by default, as an attachment with a safe filename", async () => {
    const { token, set } = await seed();
    const res = await request(app).get(`/api/flashcards/${set._id}/export`).set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/text\/csv/);
    expect(res.headers["content-disposition"]).toBe('attachment; filename="Cell-Biology-Ch.-1.csv"');
    expect(res.text).toContain("Q1?,A1,easy,no");
    expect(res.text).toContain("'=cmd"); // formula neutralised end to end
  });

  it("downloads Anki's import format with ?format=anki", async () => {
    const { token, set } = await seed();
    const res = await request(app).get(`/api/flashcards/${set._id}/export?format=anki`).set("Authorization", `Bearer ${token}`);
    expect(res.headers["content-disposition"]).toContain(".txt");
    expect(res.text).toContain("#deck:Cell Biology: Ch. 1");
    expect(res.text).toContain("Q1?\tA1\tdifficulty::easy");
  });

  it("rejects an unknown format with 400, and another user's set with 404", async () => {
    const { token, set } = await seed();
    expect((await request(app).get(`/api/flashcards/${set._id}/export?format=pdf`).set("Authorization", `Bearer ${token}`)).status).toBe(400);
    const other = await createUserWithToken();
    expect((await request(app).get(`/api/flashcards/${set._id}/export`).set("Authorization", `Bearer ${other.token}`)).status).toBe(404);
    expect((await request(app).get(`/api/flashcards/${set._id}/export`)).status).toBe(401);
  });

  it("exposes Content-Disposition to cross-origin pages (so the browser can read the filename)", async () => {
    const { token, set } = await seed();
    const res = await request(app).get(`/api/flashcards/${set._id}/export`).set("Authorization", `Bearer ${token}`).set("Origin", process.env.CLIENT_URL);
    expect(res.headers["access-control-expose-headers"]).toMatch(/Content-Disposition/);
  });
});

describe("GET /api/quizzes/:id/export", () => {
  const makeQuiz = async (user, document, completed) => {
    const quiz = await Quiz.create({ user: user._id, document: document._id, title: "Quiz One", questions: [{ question: "Q?", options: ["a", "b", "c", "d"], correctAnswer: "a", explanation: "Because." }] });
    if (completed) {
      quiz.userAnswers = [{ questionId: quiz.questions[0]._id, answer: "b" }];
      quiz.isCompleted = true;
      quiz.score = 0;
      await quiz.save();
    }
    return quiz;
  };

  it("exports a finished quiz as Markdown with the key and the user's answers", async () => {
    const { user, token, document } = await seed();
    const quiz = await makeQuiz(user, document, true);
    const res = await request(app).get(`/api/quizzes/${quiz._id}/export`).set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/markdown/);
    expect(res.text).toContain("- a  — ✅ correct");
    expect(res.text).toContain("- b  — ❌ your answer");
  });

  it("refuses to export an UNFINISHED quiz — its answer key must not leave the server", async () => {
    const { user, token, document } = await seed();
    const quiz = await makeQuiz(user, document, false);
    const res = await request(app).get(`/api/quizzes/${quiz._id}/export`).set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(400);
    expect(res.text).not.toContain("Because.");
  });

  it("404s for another user's quiz", async () => {
    const { user, document } = await seed();
    const quiz = await makeQuiz(user, document, true);
    const other = await createUserWithToken();
    expect((await request(app).get(`/api/quizzes/${quiz._id}/export`).set("Authorization", `Bearer ${other.token}`)).status).toBe(404);
  });
});
