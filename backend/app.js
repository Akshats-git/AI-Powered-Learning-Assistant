import path from "path";
import { fileURLToPath } from "url";
import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import cookieParser from "cookie-parser";

import { notFound, errorHandler } from "./middlewares/errorMiddleware.js";
import { requestId } from "./middlewares/requestId.js";
import { httpLogger } from "./utils/logger.js";
import authRoutes from "./routes/authRoutes.js";
import documentRoutes from "./routes/documentRoutes.js";
import aiRoutes from "./routes/aiRoutes.js";
import flashcardRoutes from "./routes/flashcardRoutes.js";
import quizRoutes from "./routes/quizRoutes.js";
import dashboardRoutes from "./routes/dashboardRoutes.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(requestId);
app.use(httpLogger);
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
  })
);
app.use(compression());
app.use(cors({ origin: process.env.CLIENT_URL, credentials: true }));
app.use(express.json());
app.use(cookieParser());
app.use(
  "/uploads",
  (req, res, next) => {
    res.removeHeader("X-Frame-Options");
    next();
  },
  express.static(path.join(__dirname, "uploads"))
);

// Liveness: the process is up and serving requests. A load balancer or
// orchestrator uses this to decide whether to restart the container — it
// should stay green even if a downstream dependency is having a bad day.
app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok" });
});

// Readiness: the process is up AND its dependencies are actually reachable.
// An orchestrator uses this to decide whether to route traffic here.
app.get("/ready", (req, res) => {
  const dbReady = mongoose.connection.readyState === 1;
  res.status(dbReady ? 200 : 503).json({
    status: dbReady ? "ready" : "not ready",
    checks: { mongo: dbReady ? "ok" : "unavailable" },
  });
});

app.use("/api/auth", authRoutes);
app.use("/api/documents", documentRoutes);
app.use("/api/ai", aiRoutes);
app.use("/api/flashcards", flashcardRoutes);
app.use("/api/quizzes", quizRoutes);
app.use("/api/dashboard", dashboardRoutes);

app.use(notFound);
app.use(errorHandler);

export default app;
