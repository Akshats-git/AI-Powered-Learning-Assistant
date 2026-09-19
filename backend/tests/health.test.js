import { describe, it, expect } from "vitest";
import request from "supertest";
import app from "../app.js";

describe("health and readiness", () => {
  it("GET /health always reports ok", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
  });

  it("GET /ready reports ready when the database is connected", async () => {
    const res = await request(app).get("/ready");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ready");
    expect(res.body.checks.mongo).toBe("ok");
  });
});

describe("GET /ready — LLM provider state", () => {
  it("reports the LLM as ok normally", async () => {
    const res = await request(app).get("/ready");
    expect(res.status).toBe(200);
    expect(res.body.checks.llm).toBe("ok");
  });

  it("reports 'degraded' while the circuit breaker is open, but stays READY (only AI features are down)", async () => {
    const { providerBreaker } = await import("../utils/circuitBreaker.js");
    const trip = () => providerBreaker.run(() => Promise.reject(Object.assign(new Error("down"), { status: 503 }))).catch(() => {});
    for (let i = 0; i < 5; i += 1) await trip();
    expect(providerBreaker.getState()).toBe("open");

    const res = await request(app).get("/ready");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ready");
    expect(res.body.checks.llm).toBe("degraded");
  });
});
