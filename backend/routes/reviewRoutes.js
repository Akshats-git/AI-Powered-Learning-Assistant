import express from "express";
import { getDueQueue } from "../controllers/reviewController.js";
import { protect } from "../middlewares/authMiddleware.js";
import { validate } from "../middlewares/validate.js";
import { dueQueueSchema } from "../validators/reviewSchemas.js";

const router = express.Router();

router.use(protect);

router.get("/due", validate(dueQueueSchema), getDueQueue);

export default router;
