import rateLimit, { ipKeyGenerator } from "express-rate-limit";

export const aiRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?._id?.toString() || ipKeyGenerator(req.ip),
  message: { message: "Too many AI requests, please try again later" },
});

// Login/register have no req.user yet, so this is IP-keyed. It's the backstop
// against email enumeration and password guessing that account lockout alone
// doesn't cover (lockout is per-account; this caps how many accounts one
// caller can probe at all).
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => ipKeyGenerator(req.ip),
  message: { message: "Too many attempts, please try again later" },
});
