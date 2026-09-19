import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import http from "http";

let server;
let hits = 0;

beforeAll(async () => {
  server = http.createServer((req, res) => {
    hits += 1;
    res.writeHead(503, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: { message: "overloaded" } }));
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  process.env.OPENAI_BASE_URL = `http://127.0.0.1:${server.address().port}/v1`;
  process.env.OPENAI_API_KEY = "sk-test-key";
  process.env.CIRCUIT_FAILURE_THRESHOLD = "2";
  process.env.CIRCUIT_RESET_MS = "60000";
  vi.resetModules();
});

afterAll(async () => {
  delete process.env.OPENAI_BASE_URL;
  delete process.env.CIRCUIT_FAILURE_THRESHOLD;
  delete process.env.CIRCUIT_RESET_MS;
  await new Promise((r) => server.close(r));
});

describe("generate() behind the circuit breaker", () => {
  it("wraps provider failures as 502, then fails fast with 503 and stops calling the provider", async () => {
    const { generate } = await import("../utils/aiClient.js");

    const first = await generate("hi").catch((e) => e);
    const second = await generate("hi").catch((e) => e);
    expect(first.statusCode).toBe(502);
    expect(second.statusCode).toBe(502);

    const hitsBeforeOpen = hits;
    const third = await generate("hi").catch((e) => e);
    expect(third.statusCode).toBe(503);
    expect(third.code).toBe("CIRCUIT_OPEN");
    expect(hits).toBe(hitsBeforeOpen);
  }, 30000);
});
