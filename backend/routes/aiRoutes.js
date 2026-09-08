import express from "express";
import {
  generateFlashcards,
  generateQuiz,
  generateSummary,
  explainConcept,
  chatWithDocument,
  getChatHistory,
} from "../controllers/aiController.js";
import { protect } from "../middlewares/authMiddleware.js";
import { aiRateLimiter } from "../middlewares/rateLimiter.js";
import { validate } from "../middlewares/validate.js";
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
router.use(aiRateLimiter);

router.post("/generate-flashcards", validate(generateFlashcardsSchema), generateFlashcards);
router.post("/generate-quiz", validate(generateQuizSchema), generateQuiz);
router.post("/summary", validate(summarySchema), generateSummary);
router.post("/explain", validate(explainSchema), explainConcept);
router.post("/chat", validate(chatSchema), chatWithDocument);
router.get("/chat-history/:documentId", validate(chatHistoryParamsSchema), getChatHistory);

export default router;
