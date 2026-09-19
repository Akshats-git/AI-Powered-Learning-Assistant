import express from "express";
import { getCostOverview, listAuditLog } from "../controllers/adminController.js";
import { protect } from "../middlewares/authMiddleware.js";
import { requireAdmin } from "../middlewares/adminMiddleware.js";

const router = express.Router();

router.use(protect, requireAdmin);

router.get("/costs", getCostOverview);
router.get("/audit", listAuditLog);

export default router;
