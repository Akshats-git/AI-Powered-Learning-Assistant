import { describe, it, expect, vi, afterEach } from "vitest";
import http from "http";
import request from "supertest";
import app from "../app.js";
import { installGracefulShutdown, isDraining, resetDrainingForTests } from "../utils/gracefulShutdown.js";

afterEach(() => resetDrainingForTests());

const listen = (handler) =>
  new Promise((resolve) => {
    const server = http.createServer(handler);
    server.listen(0, "127.0.0.1", () => resolve(server));
  });

describe("installGracefulShutdown", () => {
  it("lets an in-flight request finish, then closes dependencies and exits 0", async () => {
    const server = await listen((req, res) => setTimeout(() => res.end("done"), 300));
    const onClose = vi.fn(async () => {});
    const exit = vi.fn();
    const shutdown = installGracefulShutdown({ server, onClose, exit, signals: [] });
    const { port } = server.address();

    const inFlight = fetch(`http://127.0.0.1:${port}/`).then((r) => r.text());
    await new Promise((r) => setTimeout(r, 50));
    const done = shutdown("SIGTERM");

    expect(await inFlight).toBe("done");
    await done;
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledWith(0);
  });

  it("refuses new connections once shutdown has begun", async () => {
    const server = await listen((req, res) => res.end("ok"));
    const { port } = server.address();
    const shutdown = installGracefulShutdown({ server, exit: vi.fn(), signals: [] });
    await shutdown("SIGTERM");
    await expect(fetch(`http://127.0.0.1:${port}/`)).rejects.toThrow();
  });

  it("only runs once even if signalled twice", async () => {
    const server = await listen((req, res) => res.end("ok"));
    const onClose = vi.fn(async () => {});
    const shutdown = installGracefulShutdown({ server, onClose, exit: vi.fn(), signals: [] });
    await Promise.all([shutdown("SIGTERM"), shutdown("SIGINT")]);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("exits 1 if closing a dependency fails", async () => {
    const server = await listen((req, res) => res.end("ok"));
    const exit = vi.fn();
    const shutdown = installGracefulShutdown({ server, onClose: async () => { throw new Error("boom"); }, exit, signals: [] });
    await shutdown("SIGTERM");
    expect(exit).toHaveBeenCalledWith(1);
  });

  it("makes /ready report 503 while draining, so the orchestrator stops routing here", async () => {
    expect((await request(app).get("/ready")).status).toBe(200);
    const server = await listen((req, res) => res.end("ok"));
    await installGracefulShutdown({ server, exit: vi.fn(), signals: [] })("SIGTERM");
    expect(isDraining()).toBe(true);
    const res = await request(app).get("/ready");
    expect(res.status).toBe(503);
    expect(res.body.checks.draining).toBe(true);
  });
});
