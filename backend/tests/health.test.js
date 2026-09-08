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
