import { logger } from "../utils/logger.js";

// Default error codes by status, so a handler that only sets statusCode
// (the vast majority of the codebase) still gets a stable machine-readable
// code without every call site having to name one.
const DEFAULT_CODES = {
  400: "BAD_REQUEST",
  401: "UNAUTHORIZED",
  403: "FORBIDDEN",
  404: "NOT_FOUND",
  409: "CONFLICT",
  429: "TOO_MANY_REQUESTS",
  502: "BAD_GATEWAY",
  503: "SERVICE_UNAVAILABLE",
};

export const notFound = (req, res, next) => {
  res.status(404);
  next(new Error(`Route not found - ${req.originalUrl}`));
};

// Database errors that are really the client's doing, not a server fault.
const classifyDbError = (err) => {
  if (err.code === 11000) return { statusCode: 409, message: "That record already exists" };
  if (err.name === "ValidationError") return { statusCode: 400, message: "Invalid data" };
  if (err.name === "CastError") return { statusCode: 400, message: "Invalid identifier" };
  return null;
};

export const errorHandler = (err, req, res, next) => {
  const db = !err.statusCode ? classifyDbError(err) : null;
  const statusCode = db?.statusCode || err.statusCode || (res.statusCode && res.statusCode !== 200 ? res.statusCode : 500);
  // In production a 5xx message is an internal detail (driver text, paths, upstream
  // provider errors) — log it, but tell the client something generic. A 4xx
  // message is written for the user, and an explicit err.code marks a deliberate one.
  const hideMessage = process.env.NODE_ENV === "production" && statusCode >= 500 && !err.code;
  const message = hideMessage ? "Something went wrong on our side. Please try again." : db?.message || err.message || "Server error";

  if (statusCode >= 500) {
    logger.error({ err, requestId: req.id, path: req.originalUrl }, err.message);
  }

  res.status(statusCode).json({
    error: {
      code: err.code || DEFAULT_CODES[statusCode] || "INTERNAL_ERROR",
      message,
      ...(err.details && { details: err.details }),
      requestId: req.id,
      ...(process.env.NODE_ENV !== "production" && { stack: err.stack }),
    },
  });
};
