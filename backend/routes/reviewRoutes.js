import express from "express";
import { getDueQueue, getRetentionForecast, getStreak } from "../controllers/reviewController.js";
import { protect } from "../middlewares/authMiddleware.js";
import { validate } from "../middlewares/validate.js";
import { dueQueueSchema } from "../validators/reviewSchemas.js";
import { idParamsSchema } from "../validators/requestSchema.js";

const router = express.Router();

router.use(protect);

router.get("/due", validate(dueQueueSchema), getDueQueue);
router.get("/streak", getStreak);
router.get("/forecast/:setId", validate(idParamsSchema("setId")), getRetentionForecast);

export default router;
