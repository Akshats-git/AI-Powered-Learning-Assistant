import { describe, it, expect } from "vitest";
import { createCircuitBreaker, isProviderFailure, CircuitOpenError } from "../utils/circuitBreaker.js";

const fail = () => Promise.reject(Object.assign(new Error("provider down"), { status: 503 }));
const ok = () => Promise.resolve("fine");

const setup = (opts = {}) => {
  let t = 1000;
  const breaker = createCircuitBreaker({ failureThreshold: 3, resetMs: 30000, now: () => t, ...opts });
  return { breaker, advance: (ms) => { t += ms; } };
};

describe("circuit breaker", () => {
  it("passes calls through while closed and returns their result", async () => {
    const { breaker } = setup();
    expect(await breaker.run(ok)).toBe("fine");
    expect(breaker.getState()).toBe("closed");
  });

  it("opens after N consecutive failures, then rejects without calling the provider", async () => {
    const { breaker } = setup();
    for (let i = 0; i < 3; i += 1) await expect(breaker.run(fail)).rejects.toThrow("provider down");
    expect(breaker.getState()).toBe("open");

    let called = false;
    await expect(breaker.run(async () => { called = true; })).rejects.toBeInstanceOf(CircuitOpenError);
    expect(called).toBe(false);
  });

  it("the open rejection is a 503 with a retry hint", async () => {
    const { breaker } = setup();
    for (let i = 0; i < 3; i += 1) await breaker.run(fail).catch(() => {});
    const err = await breaker.run(ok).catch((e) => e);
    expect(err.statusCode).toBe(503);
    expect(err.code).toBe("CIRCUIT_OPEN");
    expect(err.retryAfterSeconds).toBe(30);
  });

  it("a success in between resets the failure count", async () => {
    const { breaker } = setup();
    await breaker.run(fail).catch(() => {});
    await breaker.run(fail).catch(() => {});
    await breaker.run(ok);
    await breaker.run(fail).catch(() => {});
    await breaker.run(fail).catch(() => {});
    expect(breaker.getState()).toBe("closed");
  });

  it("after the reset window lets one probe through; success closes it", async () => {
    const { breaker, advance } = setup();
    for (let i = 0; i < 3; i += 1) await breaker.run(fail).catch(() => {});
    advance(30001);
    expect(breaker.getState()).toBe("half-open");
    expect(await breaker.run(ok)).toBe("fine");
    expect(breaker.getState()).toBe("closed");
  });

  it("a failed probe re-opens it for another full window", async () => {
    const { breaker, advance } = setup();
    for (let i = 0; i < 3; i += 1) await breaker.run(fail).catch(() => {});
    advance(30001);
    await breaker.run(fail).catch(() => {});
    expect(breaker.getState()).toBe("open");
    advance(10000);
    await expect(breaker.run(ok)).rejects.toBeInstanceOf(CircuitOpenError);
  });

  it("allows only one probe at a time while half-open", async () => {
    const { breaker, advance } = setup();
    for (let i = 0; i < 3; i += 1) await breaker.run(fail).catch(() => {});
    advance(30001);
    let release;
    const probe = breaker.run(() => new Promise((r) => { release = r; }));
    await expect(breaker.run(ok)).rejects.toBeInstanceOf(CircuitOpenError);
    release("done");
    await probe;
    expect(breaker.getState()).toBe("closed");
  });

  it("does not count errors the caller caused (isFailure=false)", async () => {
    const { breaker } = setup();
    const badKey = () => Promise.reject(Object.assign(new Error("bad key"), { status: 401 }));
    for (let i = 0; i < 10; i += 1) await breaker.run(badKey, { isFailure: isProviderFailure }).catch(() => {});
    expect(breaker.getState()).toBe("closed");
  });
});

describe("isProviderFailure", () => {
  it("blames the provider for network errors, 5xx and 429, but not other 4xx", () => {
    expect(isProviderFailure(new Error("ECONNRESET"))).toBe(true);
    expect(isProviderFailure({ status: 500 })).toBe(true);
    expect(isProviderFailure({ status: 503 })).toBe(true);
    expect(isProviderFailure({ status: 429 })).toBe(true);
    expect(isProviderFailure({ status: 401 })).toBe(false);
    expect(isProviderFailure({ status: 400 })).toBe(false);
  });
});
