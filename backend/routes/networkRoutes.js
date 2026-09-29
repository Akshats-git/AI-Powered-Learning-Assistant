import express from "express";
import {
  networkStatus,
  discover,
  suggestions,
  select,
  init,
  confirm,
  status,
} from "../controllers/networkController.js";
import { protect } from "../middlewares/authMiddleware.js";

const router = express.Router();

router.use(protect);

router.get("/status", networkStatus);
router.get("/suggestions", suggestions);
router.post("/discover", discover);
router.post("/select", select);
router.post("/init", init);
router.post("/confirm", confirm);
router.post("/status", status);

export default router;
