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
import adminRoutes from "./routes/adminRoutes.js";
import reviewRoutes from "./routes/reviewRoutes.js";
import masteryRoutes from "./routes/masteryRoutes.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

// Render/Railway/Fly all put a reverse proxy in front of the app. Without
// this, req.ip is the proxy's internal IP for every request — every user
// shares one bucket in the AI/auth rate limiters and one row in the account
// lockout counter, and audit-relevant IPs are wrong. "1" trusts exactly one
// hop (the platform's own proxy), which is what all three of those look
// like — not "true", which would trust an arbitrary X-Forwarded-For an
// attacker could spoof if there were ever a second hop.
if (process.env.NODE_ENV === "production") {
  app.set("trust proxy", 1);
}

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
app.use("/api/admin", adminRoutes);
app.use("/api/review", reviewRoutes);
app.use("/api/mastery", masteryRoutes);

app.use(notFound);
app.use(errorHandler);

export default app;
