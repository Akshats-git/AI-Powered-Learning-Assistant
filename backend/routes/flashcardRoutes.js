import express from "express";
import {
  listFlashcardSets,
  listFlashcardSetsForDocument,
  getFlashcardSet,
  reviewCard,
  toggleFavoriteCard,
  deleteFlashcardSet,
  exportFlashcardSet,
} from "../controllers/flashcardController.js";
import { protect } from "../middlewares/authMiddleware.js";
import { validate } from "../middlewares/validate.js";
import { idParamsSchema } from "../validators/requestSchema.js";
import { reviewCardSchema } from "../validators/reviewSchemas.js";

const router = express.Router();

router.use(protect);

router.get("/", listFlashcardSets);
router.get("/document/:documentId", validate(idParamsSchema("documentId")), listFlashcardSetsForDocument);
router.get("/:setId", validate(idParamsSchema("setId")), getFlashcardSet);
router.get("/:setId/export", validate(idParamsSchema("setId")), exportFlashcardSet);
router.put("/:setId/cards/:cardId/review", validate(reviewCardSchema), reviewCard);
router.put("/:setId/cards/:cardId/favorite", validate(idParamsSchema("setId", "cardId")), toggleFavoriteCard);
router.delete("/:setId", validate(idParamsSchema("setId")), deleteFlashcardSet);

export default router;
