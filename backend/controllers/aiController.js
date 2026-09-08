import Flashcard from "../models/Flashcard.js";
import Quiz from "../models/Quiz.js";
import ChatHistory from "../models/ChatHistory.js";
import { getOwnedDocument } from "../utils/getOwnedDocument.js";
import { generate } from "../utils/aiClient.js";
import { withInFlightGuard } from "../utils/inFlightGuard.js";
import { assertWithinBudget, recordSpend } from "../utils/aiBudget.js";
import { flashcardPrompt, quizPrompt, summaryPrompt, explainPrompt, chatPrompt } from "../utils/prompts.js";

const CHAT_CONTEXT_SIZE = 10;
const DIFFICULTIES = ["easy", "medium", "hard"];

const clampCount = (value, fallback, max) => (Number.isFinite(value) ? Math.min(value, max) : fallback);

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
    await assertWithinBudget(req.user._id);

    const cardCount = clampCount(count, 10, 30);

    const flashcardSet = await withInFlightGuard(`${req.user._id}:${documentId}:flashcards`, async () => {
      let costUsd = 0;
      const result = await generate(flashcardPrompt(document.extractedText, cardCount), {
        json: true,
        feature: "flashcards",
        onUsage: (usage) => {
          costUsd = usage.costUsd || 0;
        },
      });
      await recordSpend(req.user._id, costUsd);

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

      return Flashcard.create({
        user: req.user._id,
        document: document._id,
        title: `${document.title} Flashcards`,
        cards,
      });
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
    await assertWithinBudget(req.user._id);

    const questionCount = clampCount(numQuestions, 5, 20);

    const quiz = await withInFlightGuard(`${req.user._id}:${documentId}:quiz`, async () => {
      let costUsd = 0;
      const result = await generate(quizPrompt(document.extractedText, questionCount), {
        json: true,
        feature: "quiz",
        onUsage: (usage) => {
          costUsd = usage.costUsd || 0;
        },
      });
      await recordSpend(req.user._id, costUsd);

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

      return Quiz.create({
        user: req.user._id,
        document: document._id,
        title: `${document.title} Quiz`,
        questions,
      });
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
    await assertWithinBudget(req.user._id);

    const summary = await withInFlightGuard(`${req.user._id}:${documentId}:summary`, async () => {
      let costUsd = 0;
      const result = await generate(summaryPrompt(document.extractedText), {
        feature: "summary",
        onUsage: (usage) => {
          costUsd = usage.costUsd || 0;
        },
      });
      await recordSpend(req.user._id, costUsd);
      return result;
    });

    res.status(200).json({ summary });
  } catch (err) {
    next(err);
  }
};

export const explainConcept = async (req, res, next) => {
  try {
    const { documentId, concept } = req.body;
    const document = await getOwnedDocument(documentId, req.user._id);
    assertHasText(document);
    await assertWithinBudget(req.user._id);

    const explanation = await withInFlightGuard(`${req.user._id}:${documentId}:explain:${concept}`, async () => {
      let costUsd = 0;
      const result = await generate(explainPrompt(document.extractedText, concept), {
        feature: "explain",
        onUsage: (usage) => {
          costUsd = usage.costUsd || 0;
        },
      });
      await recordSpend(req.user._id, costUsd);
      return result;
    });

    res.status(200).json({ explanation });
  } catch (err) {
    next(err);
  }
};

export const chatWithDocument = async (req, res, next) => {
  try {
    const { documentId, message } = req.body;
    const document = await getOwnedDocument(documentId, req.user._id);
    assertHasText(document);
    await assertWithinBudget(req.user._id);

    const existingChat = await ChatHistory.findOne({ user: req.user._id, document: document._id });
    const recentHistory = existingChat ? existingChat.messages.slice(-CHAT_CONTEXT_SIZE) : [];

    let costUsd = 0;
    const reply = await generate(chatPrompt(document.extractedText, recentHistory, message), {
      feature: "chat",
      onUsage: (usage) => {
        costUsd = usage.costUsd || 0;
      },
    });
    await recordSpend(req.user._id, costUsd);

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
