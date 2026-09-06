import Flashcard from "../models/Flashcard.js";
import Quiz from "../models/Quiz.js";
import ChatHistory from "../models/ChatHistory.js";
import { getOwnedDocument } from "../utils/getOwnedDocument.js";
import { generate } from "../utils/aiClient.js";
import { flashcardPrompt, quizPrompt, summaryPrompt, explainPrompt, chatPrompt } from "../utils/prompts.js";

const CHAT_CONTEXT_SIZE = 10;
const DIFFICULTIES = ["easy", "medium", "hard"];

const clampCount = (value, fallback, max) => {
  const n = parseInt(value, 10);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.min(n, max);
};

const assertHasText = (document) => {
  if (!document.extractedText || !document.extractedText.trim()) {
    const err = new Error("This document has no extracted text to work with");
    err.statusCode = 400;
    throw err;
  }
};

export const generateFlashcards = async (req, res, next) => {
  try {
    const { documentId, count } = req.body;
    const document = await getOwnedDocument(documentId, req.user._id);
    assertHasText(document);

    const cardCount = clampCount(count, 10, 30);
    const result = await generate(flashcardPrompt(document.extractedText, cardCount), { json: true });

    if (!Array.isArray(result.flashcards)) {
      const err = new Error("AI response did not include a flashcards array");
      err.statusCode = 502;
      throw err;
    }

    const cards = result.flashcards.map((c) => ({
      question: c.question,
      answer: c.answer,
      difficulty: DIFFICULTIES.includes(c.difficulty) ? c.difficulty : "medium",
    }));

    const flashcardSet = await Flashcard.create({
      user: req.user._id,
      document: document._id,
      title: `${document.title} Flashcards`,
      cards,
    });

    res.status(201).json(flashcardSet);
  } catch (err) {
    next(err);
  }
};

export const generateQuiz = async (req, res, next) => {
  try {
    const { documentId, numQuestions } = req.body;
    const document = await getOwnedDocument(documentId, req.user._id);
    assertHasText(document);

    const questionCount = clampCount(numQuestions, 5, 20);
    const result = await generate(quizPrompt(document.extractedText, questionCount), { json: true });

    if (!Array.isArray(result.questions)) {
      const err = new Error("AI response did not include a questions array");
      err.statusCode = 502;
      throw err;
    }

    const questions = result.questions.map((q) => ({
      question: q.question,
      options: q.options,
      correctAnswer: q.correctAnswer,
      explanation: q.explanation || "",
    }));

    const quiz = await Quiz.create({
      user: req.user._id,
      document: document._id,
      title: `${document.title} Quiz`,
      questions,
    });

    res.status(201).json(quiz);
  } catch (err) {
    next(err);
  }
};

export const generateSummary = async (req, res, next) => {
  try {
    const { documentId } = req.body;
    const document = await getOwnedDocument(documentId, req.user._id);
    assertHasText(document);

    const summary = await generate(summaryPrompt(document.extractedText));

    res.status(200).json({ summary });
  } catch (err) {
    next(err);
  }
};

export const explainConcept = async (req, res, next) => {
  try {
    const { documentId, concept } = req.body;
    if (!concept) {
      res.status(400);
      throw new Error("A concept is required");
    }

    const document = await getOwnedDocument(documentId, req.user._id);
    assertHasText(document);

    const explanation = await generate(explainPrompt(document.extractedText, concept));

    res.status(200).json({ explanation });
  } catch (err) {
    next(err);
  }
};

export const chatWithDocument = async (req, res, next) => {
  try {
    const { documentId, message } = req.body;
    if (!message) {
      res.status(400);
      throw new Error("A message is required");
    }

    const document = await getOwnedDocument(documentId, req.user._id);
    assertHasText(document);

    const existingChat = await ChatHistory.findOne({ user: req.user._id, document: document._id });
    const recentHistory = existingChat ? existingChat.messages.slice(-CHAT_CONTEXT_SIZE) : [];

    const reply = await generate(chatPrompt(document.extractedText, recentHistory, message));

    const chat = await ChatHistory.findOneAndUpdate(
      { user: req.user._id, document: document._id },
      {
        $push: {
          messages: {
            $each: [
              { role: "user", content: message },
              { role: "assistant", content: reply },
            ],
          },
        },
      },
      { new: true, upsert: true }
    );

    res.status(200).json({ reply, messages: chat.messages });
  } catch (err) {
    next(err);
  }
};

export const getChatHistory = async (req, res, next) => {
  try {
    const document = await getOwnedDocument(req.params.documentId, req.user._id);
    const chat = await ChatHistory.findOne({ user: req.user._id, document: document._id });

    res.status(200).json(chat ? chat.messages : []);
  } catch (err) {
    next(err);
  }
};
