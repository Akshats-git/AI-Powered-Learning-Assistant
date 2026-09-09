import express from "express";
import { listMastery } from "../controllers/masteryController.js";
import { protect } from "../middlewares/authMiddleware.js";

const router = express.Router();

router.use(protect);

router.get("/", listMastery);

export default router;
