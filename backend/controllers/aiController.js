import Flashcard from "../models/Flashcard.js";
import Quiz from "../models/Quiz.js";
import ChatHistory from "../models/ChatHistory.js";
import Chunk from "../models/Chunk.js";
import { getOwnedDocument } from "../utils/getOwnedDocument.js";
import { generate } from "../utils/aiClient.js";
import { withInFlightGuard } from "../utils/inFlightGuard.js";
import { assertWithinBudget, recordSpend } from "../utils/aiBudget.js";
import { recordLlmCall } from "../utils/llmLedger.js";
import { flashcardPrompt, quizPrompt, summaryPrompt, explainPrompt, chatPrompt, retrievalChatPrompt } from "../utils/prompts.js";
import { hybridSearch } from "../utils/hybridRetrieval.js";
import { buildRetrievedContext, toSources } from "../utils/citations.js";
import { embedTexts } from "../utils/embeddings.js";
import { logger } from "../utils/logger.js";

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
      let usageInfo = null;
      const result = await generate(flashcardPrompt(document.extractedText, cardCount), {
        json: true,
        feature: "flashcards",
        onUsage: (info) => {
          usageInfo = info;
        },
      });
      await recordSpend(req.user._id, usageInfo?.costUsd || 0);
      await recordLlmCall(req.user._id, req.id, "flashcards", usageInfo);

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
      let usageInfo = null;
      const result = await generate(quizPrompt(document.extractedText, questionCount), {
        json: true,
        feature: "quiz",
        onUsage: (info) => {
          usageInfo = info;
        },
      });
      await recordSpend(req.user._id, usageInfo?.costUsd || 0);
      await recordLlmCall(req.user._id, req.id, "quiz", usageInfo);

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
      let usageInfo = null;
      const result = await generate(summaryPrompt(document.extractedText), {
        feature: "summary",
        onUsage: (info) => {
          usageInfo = info;
        },
      });
      await recordSpend(req.user._id, usageInfo?.costUsd || 0);
      await recordLlmCall(req.user._id, req.id, "summary", usageInfo);
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
      let usageInfo = null;
      const result = await generate(explainPrompt(document.extractedText, concept), {
        feature: "explain",
        onUsage: (info) => {
          usageInfo = info;
        },
      });
      await recordSpend(req.user._id, usageInfo?.costUsd || 0);
      await recordLlmCall(req.user._id, req.id, "explain", usageInfo);
      return result;
    });

    res.status(200).json({ explanation });
  } catch (err) {
    next(err);
  }
};

// Embeds the question (best-effort — a failure here degrades to lexical-only
// retrieval, it never fails the chat) and records that embedding's spend
// through the same budget/ledger every other AI call goes through.
const embedQuery = async (message, { userId, requestId, documentId }) => {
  if (!process.env.OPENAI_API_KEY) return null;

  try {
    const batchUsages = [];
    const [vector] = await embedTexts([message], { onUsage: (usage) => batchUsages.push(usage) });
    for (const usage of batchUsages) {
      await recordSpend(userId, usage.costUsd || 0);
      await recordLlmCall(userId, requestId, "embedding", {
        model: usage.model,
        usage: { prompt_tokens: usage.totalTokens, completion_tokens: 0, total_tokens: usage.totalTokens },
        costUsd: usage.costUsd,
        latencyMs: usage.latencyMs,
      });
    }
    return vector || null;
  } catch (err) {
    logger.error({ err: err.message, documentId }, "Query embedding failed — falling back to lexical-only retrieval");
    return null;
  }
};

// Chooses between retrieval-augmented and whole-document prompting: a
// document only has Chunk rows once it's been through ingest.js, and hybrid
// search only has something to fuse once at least one chunk matched the
// query at all — both fall back to the old truncation-based chatPrompt
// rather than sending the model an empty excerpt block.
const buildChatPrompt = async ({ document, message, recentHistory, userId, requestId }) => {
  const wholeDocumentFallback = () => ({ prompt: chatPrompt(document.extractedText, recentHistory, message), sources: [] });

  const chunks = await Chunk.find({ document: document._id })
    .select("text page endPage sectionPath embedding")
    .lean();
  if (chunks.length === 0) return wholeDocumentFallback();

  const queryEmbedding = await embedQuery(message, { userId, requestId, documentId: document._id });

  const results = hybridSearch({
    query: message,
    queryEmbedding,
    chunks: chunks.map((c) => ({ id: c._id, text: c.text, embedding: c.embedding, page: c.page, endPage: c.endPage, sectionPath: c.sectionPath })),
  });
  if (results.length === 0) return wholeDocumentFallback();

  return { prompt: retrievalChatPrompt(buildRetrievedContext(results), recentHistory, message), sources: toSources(results) };
};

export const chatWithDocument = async (req, res, next) => {
  try {
    const { documentId, message } = req.body;
    const document = await getOwnedDocument(documentId, req.user._id);
    assertHasText(document);
    await assertWithinBudget(req.user._id);

    const existingChat = await ChatHistory.findOne({ user: req.user._id, document: document._id });
    const recentHistory = existingChat ? existingChat.messages.slice(-CHAT_CONTEXT_SIZE) : [];

    const { prompt, sources } = await buildChatPrompt({ document, message, recentHistory, userId: req.user._id, requestId: req.id });

    let usageInfo = null;
    const reply = await generate(prompt, {
      feature: "chat",
      onUsage: (info) => {
        usageInfo = info;
      },
    });
    await recordSpend(req.user._id, usageInfo?.costUsd || 0);
    await recordLlmCall(req.user._id, req.id, "chat", usageInfo);

    const chat = await ChatHistory.findOneAndUpdate(
      { user: req.user._id, document: document._id },
      {
        $push: {
          messages: {
            $each: [
              { role: "user", content: message },
              { role: "assistant", content: reply, ...(sources.length ? { sources } : {}) },
            ],
          },
        },
      },
      { new: true, upsert: true }
    );

    res.status(200).json({ reply, sources, messages: chat.messages });
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
