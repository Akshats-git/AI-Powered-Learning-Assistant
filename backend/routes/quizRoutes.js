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
import { validate } from "../middlewares/validate.js";
import { idParamsSchema } from "../validators/requestSchema.js";
import { submitQuizSchema } from "../validators/quizSchemas.js";

const router = express.Router();

router.use(protect);

router.get("/", listQuizzes);
router.get("/document/:documentId", validate(idParamsSchema("documentId")), listQuizzesForDocument);
router.get("/:id", validate(idParamsSchema("id")), getQuiz);
router.post("/:id/submit", validate(submitQuizSchema), submitQuiz);
router.get("/:id/results", validate(idParamsSchema("id")), getQuizResults);
router.delete("/:id", validate(idParamsSchema("id")), deleteQuiz);

export default router;
