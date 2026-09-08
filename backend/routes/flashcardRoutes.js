import express from "express";
import {
  listFlashcardSets,
  listFlashcardSetsForDocument,
  getFlashcardSet,
  reviewCard,
  toggleFavoriteCard,
  deleteFlashcardSet,
} from "../controllers/flashcardController.js";
import { protect } from "../middlewares/authMiddleware.js";
import { validate } from "../middlewares/validate.js";
import { idParamsSchema } from "../validators/requestSchema.js";

const router = express.Router();

router.use(protect);

router.get("/", listFlashcardSets);
router.get("/document/:documentId", validate(idParamsSchema("documentId")), listFlashcardSetsForDocument);
router.get("/:setId", validate(idParamsSchema("setId")), getFlashcardSet);
router.put("/:setId/cards/:cardId/review", validate(idParamsSchema("setId", "cardId")), reviewCard);
router.put("/:setId/cards/:cardId/favorite", validate(idParamsSchema("setId", "cardId")), toggleFavoriteCard);
router.delete("/:setId", validate(idParamsSchema("setId")), deleteFlashcardSet);

export default router;
