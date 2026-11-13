import express from "express";
import {
  generateFlashcards,
  generateQuiz,
  generateSummary,
  explainConcept,
  chatWithDocument,
  chatStream,
  getChatHistory,
  clearChatHistory,
} from "../controllers/aiController.js";
import { protect } from "../middlewares/authMiddleware.js";
import { attachAiKeyContext } from "../middlewares/aiKeyContext.js";
import { aiRateLimiter } from "../middlewares/rateLimiter.js";
import { validate } from "../middlewares/validate.js";
import { idempotent } from "../middlewares/idempotency.js";
import {
  generateFlashcardsSchema,
  generateQuizSchema,
  summarySchema,
  explainSchema,
  chatSchema,
  chatHistoryParamsSchema,
} from "../validators/aiSchemas.js";

const router = express.Router();

router.use(protect);

// Reading or clearing a conversation costs nothing, so it sits ahead of the AI rate
// limiter: opening a document must not eat into the 30-requests-per-15-minutes budget.
router.get("/chat-history/:documentId", validate(chatHistoryParamsSchema), getChatHistory);
router.delete("/chat-history/:documentId", validate(chatHistoryParamsSchema), clearChatHistory);

router.use(aiRateLimiter);
router.use(attachAiKeyContext);

router.post("/generate-flashcards", validate(generateFlashcardsSchema), idempotent, generateFlashcards);
router.post("/generate-quiz", validate(generateQuizSchema), idempotent, generateQuiz);
router.post("/summary", validate(summarySchema), generateSummary);
router.post("/explain", validate(explainSchema), explainConcept);
router.post("/chat", validate(chatSchema), idempotent, chatWithDocument);
router.post("/chat/stream", validate(chatSchema), chatStream);

export default router;
