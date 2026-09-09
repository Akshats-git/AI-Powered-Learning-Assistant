import express from "express";
import { getCostOverview } from "../controllers/adminController.js";
import { protect } from "../middlewares/authMiddleware.js";
import { requireAdmin } from "../middlewares/adminMiddleware.js";

const router = express.Router();

router.use(protect, requireAdmin);

router.get("/costs", getCostOverview);

export default router;
