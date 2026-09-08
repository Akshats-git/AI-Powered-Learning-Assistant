import { logger } from "../utils/logger.js";

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
    message: err.message || "Server error",
    requestId: req.id,
    ...(process.env.NODE_ENV !== "production" && { stack: err.stack }),
  });
};
