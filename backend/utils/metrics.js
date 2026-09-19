import client from "prom-client";

// One registry for the whole process, exposed at GET /metrics. The questions
// this exists to answer: which endpoint is slow (p95 per route), what is the
// LLM costing per feature/hour, and is the cache earning its keep.
export const registry = new client.Registry();
client.collectDefaultMetrics({ register: registry });

export const httpDuration = new client.Histogram({
  name: "http_request_duration_seconds",
  help: "HTTP request latency by route, method and status class",
  labelNames: ["method", "route", "status"],
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30],
  registers: [registry],
});

export const llmCalls = new client.Counter({
  name: "llm_calls_total",
  help: "LLM provider calls (cache hits excluded)",
  labelNames: ["feature", "model", "key_source"],
  registers: [registry],
});

export const llmTokens = new client.Counter({
  name: "llm_tokens_total",
  help: "LLM tokens consumed",
  labelNames: ["feature", "type"],
  registers: [registry],
});

export const llmCostUsd = new client.Counter({
  name: "llm_cost_usd_total",
  help: "Estimated LLM spend in USD",
  labelNames: ["feature", "key_source"],
  registers: [registry],
});

export const llmLatency = new client.Histogram({
  name: "llm_call_duration_seconds",
  help: "LLM provider call latency",
  labelNames: ["feature"],
  buckets: [0.25, 0.5, 1, 2, 4, 8, 16, 30],
  registers: [registry],
});

export const cacheHits = new client.Counter({
  name: "llm_cache_hits_total",
  help: "Requests served from the semantic/summary cache instead of the provider",
  labelNames: ["feature"],
  registers: [registry],
});

export const circuitState = new client.Gauge({
  name: "llm_circuit_breaker_open",
  help: "1 while the LLM circuit breaker is open (failing fast), else 0",
  registers: [registry],
});

/**
 * Route label with ids collapsed, so /api/documents/:id is one series, not one
 * per document. Built from the URL actually requested plus the pattern that
 * matched it (req.baseUrl is not reliable inside nested Express 5 routers):
 * the matched pattern replaces the URL's trailing segments.
 *
 * Anything with no matched route — 404s, static files, and requests a router's
 * auth middleware rejected before routing — is "unmatched", never the raw URL
 * (that would be unbounded cardinality: one series per garbage URL a bot tries).
 */
export const routeLabel = (req) => {
  const pattern = req.route?.path;
  if (typeof pattern !== "string") return "unmatched";

  const requested = req.originalUrl.split("?")[0].split("/").filter(Boolean);
  const patternSegments = pattern.split("/").filter(Boolean);
  const prefix = requested.slice(0, Math.max(0, requested.length - patternSegments.length));
  return `/${[...prefix, ...patternSegments].join("/")}`;
};

export const metricsMiddleware = (req, res, next) => {
  const end = httpDuration.startTimer();
  // Read the label when headers are written, not on "finish": by then Express has
  // already unwound the router stack and reset req.baseUrl/req.route.
  let route = "unmatched";
  const writeHead = res.writeHead;
  res.writeHead = function patchedWriteHead(...args) {
    route = routeLabel(req);
    return writeHead.apply(this, args);
  };
  res.on("finish", () => end({ method: req.method, route, status: `${Math.floor(res.statusCode / 100)}xx` }));
  next();
};

export const recordLlmMetrics = ({ feature, model, keySource, usage, costUsd, latencyMs }) => {
  llmCalls.inc({ feature, model, key_source: keySource });
  if (usage?.prompt_tokens) llmTokens.inc({ feature, type: "prompt" }, usage.prompt_tokens);
  if (usage?.completion_tokens) llmTokens.inc({ feature, type: "completion" }, usage.completion_tokens);
  if (costUsd) llmCostUsd.inc({ feature, key_source: keySource }, costUsd);
  if (latencyMs != null) llmLatency.observe({ feature }, latencyMs / 1000);
};

/**
 * GET /metrics guard. With METRICS_TOKEN set, a scraper must send it as a
 * bearer token. With it unset, /metrics is open in dev/test and 404 in
 * production — operational data (routes, spend) shouldn't be public by default.
 */
export const metricsAuth = (req, res, next) => {
  const token = process.env.METRICS_TOKEN;
  if (token) {
    if (req.get("authorization") === `Bearer ${token}`) return next();
    return res.status(401).set("WWW-Authenticate", "Bearer").json({ error: { code: "UNAUTHORIZED", message: "Metrics token required" } });
  }
  if (process.env.NODE_ENV === "production") return res.status(404).json({ error: { code: "NOT_FOUND", message: "Not found" } });
  return next();
};

export const metricsHandler = async (req, res) => {
  res.set("Content-Type", registry.contentType);
  res.end(await registry.metrics());
};
