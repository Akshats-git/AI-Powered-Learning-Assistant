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

export const errorHandler = (err, req, res, next) => {
  const statusCode = err.statusCode || (res.statusCode && res.statusCode !== 200 ? res.statusCode : 500);

  if (statusCode >= 500) {
    logger.error({ err, requestId: req.id, path: req.originalUrl }, err.message);
  }

  res.status(statusCode).json({
    error: {
      code: err.code || DEFAULT_CODES[statusCode] || "INTERNAL_ERROR",
      message: err.message || "Server error",
      ...(err.details && { details: err.details }),
      requestId: req.id,
      ...(process.env.NODE_ENV !== "production" && { stack: err.stack }),
    },
  });
};
