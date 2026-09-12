import express from "express";
import {
  register,
  login,
  refresh,
  logout,
  getProfile,
  updatePassword,
  forgotPassword,
  resetPassword,
  verifyEmail,
  resendVerification,
  listSessions,
  revokeSession,
  updateApiKey,
  removeApiKey,
} from "../controllers/authController.js";
import { protect } from "../middlewares/authMiddleware.js";
import { validate } from "../middlewares/validate.js";
import { authRateLimiter } from "../middlewares/rateLimiter.js";
import {
  registerSchema,
  loginSchema,
  updatePasswordSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  verifyEmailSchema,
  revokeSessionSchema,
  updateApiKeySchema,
} from "../validators/authSchemas.js";

const router = express.Router();

router.post("/register", authRateLimiter, validate(registerSchema), register);
router.post("/login", authRateLimiter, validate(loginSchema), login);
router.post("/refresh", authRateLimiter, refresh);
router.post("/logout", logout);
router.get("/profile", protect, getProfile);
router.put("/update-password", protect, validate(updatePasswordSchema), updatePassword);
router.post("/forgot-password", authRateLimiter, validate(forgotPasswordSchema), forgotPassword);
router.post("/reset-password", authRateLimiter, validate(resetPasswordSchema), resetPassword);
router.post("/verify-email", authRateLimiter, validate(verifyEmailSchema), verifyEmail);
router.post("/resend-verification", protect, authRateLimiter, resendVerification);
router.get("/sessions", protect, listSessions);
router.delete("/sessions/:familyId", protect, validate(revokeSessionSchema), revokeSession);
router.put("/api-key", protect, validate(updateApiKeySchema), updateApiKey);
router.delete("/api-key", protect, removeApiKey);

export default router;
