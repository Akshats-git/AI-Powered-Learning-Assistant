import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import User from "../models/User.js";
import Document from "../models/Document.js";
import Chunk from "../models/Chunk.js";
import Flashcard from "../models/Flashcard.js";
import Quiz from "../models/Quiz.js";
import QuizAttempt from "../models/QuizAttempt.js";
import ChatHistory from "../models/ChatHistory.js";
import Mastery from "../models/Mastery.js";
import ReviewLog from "../models/ReviewLog.js";
import { UPLOAD_DIR } from "../middlewares/uploadMiddleware.js";
import { buildSimplePdf } from "./demoPdf.js";
import { buildPageMap } from "./pageMap.js";
import { chunkText } from "./chunking.js";
import { scheduleFsrs, createInitialFsrsState } from "./fsrs.js";

export const DEMO_EMAIL = "demo@studyai.demo";
const DEMO_FILE = "demo-plant-energy-primer.pdf";
const DAY = 24 * 60 * 60 * 1000;

// Off by default in production (a public deploy must opt in with DEMO_MODE=true);
// on everywhere else so local dev and CI have it.
export const isDemoEnabled = () => (process.env.DEMO_MODE ? process.env.DEMO_MODE === "true" : process.env.NODE_ENV !== "production");

const PAGES = [
  `How Plants Turn Light Into Food\n\nPhotosynthesis is the process by which plants, algae and some bacteria convert light energy into chemical energy stored in sugar. It happens in two linked stages: the light reactions and the Calvin cycle. Together they turn carbon dioxide and water into glucose and oxygen.`,
  `The Light Reactions\n\nThe light reactions take place in the thylakoid membranes inside the chloroplast. Chlorophyll absorbs light, which excites electrons and drives an electron transport chain. This splits water, releasing oxygen as a by-product, and produces two energy carriers: ATP and NADPH.`,
  `The Calvin Cycle\n\nThe Calvin cycle takes place in the stroma of the chloroplast. It uses the ATP and NADPH made by the light reactions to fix carbon dioxide into sugar. The enzyme rubisco attaches carbon dioxide to a five-carbon molecule, and the cycle regenerates it so the process can repeat. The Calvin cycle does not need light directly, but it depends on the products of the light reactions.`,
];

const CARDS = [
  ["Where do the light reactions take place?", "In the thylakoid membranes of the chloroplast.", "easy"],
  ["What two energy carriers do the light reactions produce?", "ATP and NADPH.", "easy"],
  ["What is released when water is split during the light reactions?", "Oxygen, as a by-product.", "medium"],
  ["Where does the Calvin cycle take place?", "In the stroma of the chloroplast.", "medium"],
  ["Which enzyme attaches carbon dioxide to a five-carbon molecule?", "Rubisco.", "hard"],
  ["Why does the Calvin cycle depend on the light reactions?", "It uses the ATP and NADPH they produce to fix carbon dioxide into sugar.", "hard"],
  ["What are the two stages of photosynthesis?", "The light reactions and the Calvin cycle.", "easy"],
  ["What does photosynthesis convert light energy into?", "Chemical energy stored in sugar.", "easy"],
];

const QUESTIONS = [
  ["Where do the light reactions occur?", ["Stroma", "Thylakoid membranes", "Mitochondria", "Nucleus"], "Thylakoid membranes", "Light reactions",  "They run in the thylakoid membranes.", "Thylakoid membranes"],
  ["What do the light reactions release as a by-product?", ["Carbon dioxide", "Glucose", "Oxygen", "Nitrogen"], "Oxygen", "Light reactions", "Splitting water releases oxygen.", "Oxygen"],
  ["Where does the Calvin cycle take place?", ["Thylakoid membranes", "Stroma", "Cell wall", "Vacuole"], "Stroma", "Calvin cycle", "The Calvin cycle runs in the stroma.", "Thylakoid membranes"],
  ["Which enzyme fixes carbon dioxide in the Calvin cycle?", ["Amylase", "Catalase", "Rubisco", "Lipase"], "Rubisco", "Calvin cycle", "Rubisco attaches CO2 to a five-carbon molecule.", "Amylase"],
  ["What does the Calvin cycle use from the light reactions?", ["Glucose", "ATP and NADPH", "Oxygen", "Water"], "ATP and NADPH", "Calvin cycle", "It is powered by ATP and NADPH.", "ATP and NADPH"],
];

const writeDemoPdf = async () => {
  await fs.mkdir(UPLOAD_DIR, { recursive: true });
  const filePath = path.join(UPLOAD_DIR, DEMO_FILE);
  await fs.writeFile(filePath, buildSimplePdf(PAGES));
  return filePath;
};

const seedAll = async (user) => {
  const filePath = await writeDemoPdf();
  const extractedText = PAGES.join("\n\n");
  const pageMap = buildPageMap(PAGES.map((text, i) => ({ num: i + 1, text })));

  const document = await Document.create({
    user: user._id,
    title: "How Plants Turn Light Into Food (demo)",
    fileName: DEMO_FILE,
    filePath,
    fileSize: (await fs.stat(filePath)).size,
    mimeType: "application/pdf",
    extractedText,
    hasExtractedText: true,
    textSource: "native",
    pageCount: PAGES.length,
    pageMap,
  });

  // No embeddings: the demo is read-only and never calls the model, so nothing here should cost anything.
  const chunks = chunkText(extractedText, { pageMap });
  await Chunk.insertMany(
    chunks.map((c) => ({ user: user._id, document: document._id, index: c.index, text: c.text, page: c.page, endPage: c.endPage, sectionPath: c.sectionPath, charStart: c.charStart, charEnd: c.charEnd, tokens: c.tokens, contentHash: crypto.createHash("sha256").update(`demo:${c.text}`).digest("hex") }))
  );

  // A deck the learner has started: five cards reviewed over the last three days (so streaks, the due queue and the retention forecast have real data).
  const now = Date.now();
  const reviewedDaysAgo = [2, 2, 1, 1, 0];
  const logs = [];
  const cards = CARDS.map(([question, answer, difficulty], i) => {
    const card = { question, answer, difficulty, isFavorite: i === 4, isReviewed: false, schedule: {} };
    if (i < reviewedDaysAgo.length) {
      const reviewedAt = new Date(now - reviewedDaysAgo[i] * DAY);
      const grade = ["good", "good", "hard", "good", "easy"][i];
      const state = scheduleFsrs(createInitialFsrsState(), grade, reviewedAt);
      card.isReviewed = true;
      card.schedule = { stability: state.stability, difficulty: state.difficulty, reps: state.reps, lapses: state.lapses, lastReviewedAt: state.lastReviewedAt, dueDate: state.dueDate };
      logs.push({ grade, reviewedAt, state });
    }
    return card;
  });
  const deck = await Flashcard.create({ user: user._id, document: document._id, title: "Photosynthesis basics", cards });
  await ReviewLog.insertMany(
    logs.map((l, i) => ({ user: user._id, flashcardSet: deck._id, cardId: deck.cards[i]._id, algorithm: "fsrs", grade: l.grade, reviewedAt: l.reviewedAt, elapsedDays: null, stateBefore: createInitialFsrsState(), stateAfter: l.state }))
  );

  // A quiz already taken (60%), missing the Calvin cycle questions — which is what makes the "weak areas" panel and its practice buttons show up.
  const quiz = await Quiz.create({
    user: user._id,
    document: document._id,
    title: "Photosynthesis quiz",
    questions: QUESTIONS.map(([question, options, correctAnswer, concept, explanation]) => ({ question, options, correctAnswer, concept, explanation })),
  });
  const userAnswers = quiz.questions.map((q, i) => ({ questionId: q._id, answer: QUESTIONS[i][5] }));
  const correct = userAnswers.filter((a, i) => a.answer === QUESTIONS[i][2]).length;
  quiz.userAnswers = userAnswers;
  quiz.score = Math.round((correct / QUESTIONS.length) * 100);
  quiz.isCompleted = true;
  quiz.completedAt = new Date(now - DAY);
  await quiz.save();
  await QuizAttempt.create({ user: user._id, quiz: quiz._id, document: document._id, answers: userAnswers, total: QUESTIONS.length, correct, score: quiz.score });
  await Mastery.insertMany([
    { user: user._id, document: document._id, concept: "Light reactions", pKnown: 0.86, opportunities: 2 },
    { user: user._id, document: document._id, concept: "Calvin cycle", pKnown: 0.28, opportunities: 3 },
  ]);

  const answerChunk = chunks.find((c) => /stroma/i.test(c.text)) || chunks[chunks.length - 1];
  const stored = await Chunk.findOne({ document: document._id, index: answerChunk.index }).lean();
  await ChatHistory.create({
    user: user._id,
    document: document._id,
    messages: [
      { role: "user", content: "Where does the Calvin cycle take place?" },
      {
        role: "assistant",
        content: "The Calvin cycle takes place in the **stroma** of the chloroplast (p. 3). It uses the ATP and NADPH made by the light reactions to fix carbon dioxide into sugar.",
        sources: [{ chunkId: stored._id, page: answerChunk.page, endPage: answerChunk.endPage, snippetPage: 3, sectionPath: [], snippet: "…The Calvin cycle takes place in the stroma of the chloroplast. It uses the ATP and NADPH made by the light reactions to fix carbon dioxide into sugar…" }],
        groundedness: { grounded: true, unsupportedClaims: [] },
      },
    ],
  });
};

/**
 * The shared demo account, created and seeded on first use and reused after.
 * Nobody can sign in to it with a password (it's random and never stored in
 * clear), and its writes are refused (middlewares/authMiddleware.js) — so a
 * visitor can look around a realistic account without spending anything or
 * changing what the next visitor sees.
 */
export const ensureDemoAccount = async () => {
  let user = await User.findOne({ email: DEMO_EMAIL });

  if (!user) {
    try {
      user = await User.create({ username: "Demo Learner", email: DEMO_EMAIL, password: crypto.randomBytes(32).toString("hex"), isDemo: true, emailVerifiedAt: new Date() });
    } catch (err) {
      if (err.code !== 11000) throw err;
      user = await User.findOne({ email: DEMO_EMAIL }); // a concurrent first visitor won the race
    }
  }

  if (!(await Document.exists({ user: user._id }))) {
    try {
      await seedAll(user);
    } catch (err) {
      // A half-seeded account is worse than none: clear it so the next visit retries from scratch.
      await Promise.all([Document, Chunk, Flashcard, Quiz, QuizAttempt, ChatHistory, Mastery, ReviewLog].map((m) => m.deleteMany({ user: user._id })));
      throw err;
    }
  } else {
    // A redeploy can wipe the uploads directory; the record survives, so put the file back.
    const document = await Document.findOne({ user: user._id });
    try {
      await fs.access(document.filePath);
    } catch {
      await writeDemoPdf();
    }
  }

  return user;
};
