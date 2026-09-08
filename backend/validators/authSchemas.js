import { z } from "zod";
import { requestSchema } from "./requestSchema.js";

export const registerSchema = requestSchema({
  body: z.object({
    username: z.string().trim().min(1, "Username is required"),
    email: z.string().trim().toLowerCase().email("A valid email is required"),
    password: z.string().min(6, "Password must be at least 6 characters"),
  }),
});

export const loginSchema = requestSchema({
  body: z.object({
    email: z.string().trim().toLowerCase().email("A valid email is required"),
    password: z.string().min(1, "Password is required"),
  }),
});

export const updatePasswordSchema = requestSchema({
  body: z.object({
    currentPassword: z.string().min(1, "Current password is required"),
    newPassword: z.string().min(6, "New password must be at least 6 characters"),
  }),
});
