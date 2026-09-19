import { describe, it, expect, afterEach } from "vitest";
import request from "supertest";
import app from "../app.js";
import { createUserWithToken } from "./helpers.js";
import { recordLlmMetrics } from "../utils/metrics.js";
import { recordLlmCall, recordCacheHit } from "../utils/llmLedger.js";

afterEach(() => {
  delete process.env.METRICS_TOKEN;
  process.env.NODE_ENV = "test";
});

const scrape = async () => (await request(app).get("/metrics")).text;

describe("GET /metrics", () => {
  it("exposes Prometheus text including default process metrics", async () => {
    const res = await request(app).get("/metrics");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/text\/plain/);
    expect(res.text).toContain("process_cpu_user_seconds_total");
  });

  it("records HTTP latency per route TEMPLATE, not per raw URL (bounded cardinality)", async () => {
    const { token } = await createUserWithToken();
    await request(app).get("/api/documents/aaaaaaaaaaaaaaaaaaaaaaaa").set("Authorization", `Bearer ${token}`);
    await request(app).get("/api/documents/bbbbbbbbbbbbbbbbbbbbbbbb").set("Authorization", `Bearer ${token}`);
    await request(app).get("/definitely/not/a/route");

    const text = await scrape();
    expect(text).toMatch(/http_request_duration_seconds_count\{method="GET",route="\/api\/documents\/:id",status="4xx"\} 2/);
    expect(text).not.toContain("aaaaaaaaaaaaaaaaaaaaaaaa");
    expect(text).toContain('route="unmatched"');
    expect(text).not.toContain("/definitely/not/a/route");
  });

  it("counts LLM calls, tokens and cost by feature", async () => {
    recordLlmMetrics({ feature: "metrics-test", model: "gpt-4o-mini", keySource: "shared", usage: { prompt_tokens: 100, completion_tokens: 40 }, costUsd: 0.0123, latencyMs: 800 });
    const text = await scrape();
    expect(text).toContain('llm_calls_total{feature="metrics-test",model="gpt-4o-mini",key_source="shared"} 1');
    expect(text).toContain('llm_tokens_total{feature="metrics-test",type="prompt"} 100');
    expect(text).toContain('llm_tokens_total{feature="metrics-test",type="completion"} 40');
    expect(text).toContain('llm_cost_usd_total{feature="metrics-test",key_source="shared"} 0.0123');
  });

  it("the ledger writers feed the metrics, and cache hits are counted separately", async () => {
    const { user } = await createUserWithToken();
    await recordLlmCall(user._id, "req-1", "ledger-metrics", { model: "gpt-4o-mini", usage: { prompt_tokens: 5, completion_tokens: 5 }, costUsd: 0.001, latencyMs: 10 });
    await recordCacheHit(user._id, "req-2", "ledger-metrics");
    const text = await scrape();
    expect(text).toMatch(/llm_calls_total\{feature="ledger-metrics"[^}]*\} 1/);
    expect(text).toContain('llm_cache_hits_total{feature="ledger-metrics"} 1');
  });

  it("requires the bearer token when METRICS_TOKEN is set", async () => {
    process.env.METRICS_TOKEN = "scrape-secret";
    expect((await request(app).get("/metrics")).status).toBe(401);
    expect((await request(app).get("/metrics").set("Authorization", "Bearer wrong")).status).toBe(401);
    expect((await request(app).get("/metrics").set("Authorization", "Bearer scrape-secret")).status).toBe(200);
  });

  it("is hidden (404) in production when no token is configured", async () => {
    process.env.NODE_ENV = "production";
    expect((await request(app).get("/metrics")).status).toBe(404);
  });
});
