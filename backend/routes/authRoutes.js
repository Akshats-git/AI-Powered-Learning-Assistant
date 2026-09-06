import express from "express";
import { register, login, getProfile, updatePassword } from "../controllers/authController.js";
import { protect } from "../middlewares/authMiddleware.js";

const router = express.Router();

router.post("/register", register);
router.post("/login", login);
router.get("/profile", protect, getProfile);
router.put("/update-password", protect, updatePassword);

export default router;
