import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import cookieParser from "cookie-parser";

import { notFound, errorHandler } from "./middlewares/errorMiddleware.js";
import { requestId } from "./middlewares/requestId.js";
import { metricsMiddleware, metricsAuth, metricsHandler, circuitState } from "./utils/metrics.js";
import { providerBreaker } from "./utils/circuitBreaker.js";
import { isDraining } from "./utils/gracefulShutdown.js";
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
import searchRoutes from "./routes/searchRoutes.js";

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
app.use(metricsMiddleware);
app.use(httpLogger);
// This server only ever returns JSON and PDF bytes — never HTML a browser
// should render or run scripts from — so its CSP can be "nothing at all".
// Nothing here is framed directly any more: the frontend fetches PDFs over
// XHR and frames a blob: URL from its own origin.
app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: { "default-src": ["'none'"], "frame-ancestors": ["'none'"], "base-uri": ["'none'"], "form-action": ["'none'"] },
    },
    crossOriginResourcePolicy: { policy: "cross-origin" },
  })
);
// gzip buffers small writes until it has enough to compress, which would hold an
// event stream's tokens back until the very end — exempt it.
app.use(compression({ filter: (req, res) => !String(res.getHeader("Content-Type") || "").includes("text/event-stream") && compression.filter(req, res) }));
// exposedHeaders: without it a cross-origin page can't read the download filename.
app.use(cors({ origin: process.env.CLIENT_URL, credentials: true, exposedHeaders: ["Content-Disposition", "Idempotent-Replay"] }));
app.use(express.json());
app.use(cookieParser());
// Uploaded PDFs are deliberately NOT served statically: they're private, so
// they go through GET /api/documents/:id/file (auth + ownership check).

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
  // A draining instance is alive but must stop receiving new traffic.
  const ready = dbReady && !isDraining();
  res.status(ready ? 200 : 503).json({
    status: ready ? "ready" : "not ready",
    // "degraded" is informational, NOT a readiness failure: with the LLM provider
    // down, uploads, reading, reviewing and every non-AI page still work, so
    // pulling the whole API out of rotation would turn a partial outage total.
    checks: { mongo: dbReady ? "ok" : "unavailable", llm: providerBreaker.getState() === "open" ? "degraded" : "ok", draining: isDraining() },
  });
});

// Scrape target for Prometheus. Guarded — see metricsAuth.
app.get("/metrics", metricsAuth, (req, res, next) => {
  circuitState.set(providerBreaker.getState() === "open" ? 1 : 0);
  metricsHandler(req, res).catch(next);
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
app.use("/api/search", searchRoutes);

app.use(notFound);
app.use(errorHandler);

export default app;
