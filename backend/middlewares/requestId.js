import { randomUUID } from "crypto";

// Every request gets a stable id, propagated to logs and the response so a
// client-reported error can be traced back to the exact log lines it produced.
export const requestId = (req, res, next) => {
  req.id = req.headers["x-request-id"] || randomUUID();
  res.setHeader("X-Request-Id", req.id);
  next();
};
