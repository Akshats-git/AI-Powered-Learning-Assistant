import express from "express";
import { search } from "../controllers/searchController.js";
import { protect } from "../middlewares/authMiddleware.js";
import { searchRateLimiter } from "../middlewares/rateLimiter.js";

const router = express.Router();

router.use(protect, searchRateLimiter);
router.get("/", search);

export default router;
