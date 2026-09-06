import express from "express";
import {
  listQuizzes,
  listQuizzesForDocument,
  getQuiz,
  submitQuiz,
  getQuizResults,
  deleteQuiz,
} from "../controllers/quizController.js";
import { protect } from "../middlewares/authMiddleware.js";

const router = express.Router();

router.use(protect);

router.get("/", listQuizzes);
router.get("/document/:documentId", listQuizzesForDocument);
router.get("/:id", getQuiz);
router.post("/:id/submit", submitQuiz);
router.get("/:id/results", getQuizResults);
router.delete("/:id", deleteQuiz);

export default router;
