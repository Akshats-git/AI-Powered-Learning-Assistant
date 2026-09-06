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

const router = express.Router();

router.use(protect);

router.get("/", listFlashcardSets);
router.get("/document/:documentId", listFlashcardSetsForDocument);
router.get("/:setId", getFlashcardSet);
router.put("/:setId/cards/:cardId/review", reviewCard);
router.put("/:setId/cards/:cardId/favorite", toggleFavoriteCard);
router.delete("/:setId", deleteFlashcardSet);

export default router;
