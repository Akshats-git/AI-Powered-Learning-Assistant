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

const router = express.Router();

router.use(protect);

router.post("/generate-flashcards", generateFlashcards);
router.post("/generate-quiz", generateQuiz);
router.post("/summary", generateSummary);
router.post("/explain", explainConcept);
router.post("/chat", chatWithDocument);
router.get("/chat-history/:documentId", getChatHistory);

export default router;
