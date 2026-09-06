import express from "express";
import { getOverview } from "../controllers/dashboardController.js";
import { protect } from "../middlewares/authMiddleware.js";

const router = express.Router();

router.use(protect);

router.get("/overview", getOverview);

export default router;
