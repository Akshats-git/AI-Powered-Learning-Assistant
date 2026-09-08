import express from "express";
import { register, login, getProfile, updatePassword } from "../controllers/authController.js";
import { protect } from "../middlewares/authMiddleware.js";
import { validate } from "../middlewares/validate.js";
import { registerSchema, loginSchema, updatePasswordSchema } from "../validators/authSchemas.js";

const router = express.Router();

router.post("/register", validate(registerSchema), register);
router.post("/login", validate(loginSchema), login);
router.get("/profile", protect, getProfile);
router.put("/update-password", protect, validate(updatePasswordSchema), updatePassword);

export default router;
