import express from "express";
import { register, login, refresh, logout, getProfile, updatePassword } from "../controllers/authController.js";
import { protect } from "../middlewares/authMiddleware.js";
import { validate } from "../middlewares/validate.js";
import { authRateLimiter } from "../middlewares/rateLimiter.js";
import { registerSchema, loginSchema, updatePasswordSchema } from "../validators/authSchemas.js";

const router = express.Router();

router.post("/register", authRateLimiter, validate(registerSchema), register);
router.post("/login", authRateLimiter, validate(loginSchema), login);
router.post("/refresh", authRateLimiter, refresh);
router.post("/logout", logout);
router.get("/profile", protect, getProfile);
router.put("/update-password", protect, validate(updatePasswordSchema), updatePassword);

export default router;
