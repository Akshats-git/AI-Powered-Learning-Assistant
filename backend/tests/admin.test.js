import { describe, it, expect, beforeEach, afterEach } from "vitest";
import request from "supertest";
import app from "../app.js";
import LlmCall from "../models/LlmCall.js";
import { createUserWithToken } from "./helpers.js";

describe("GET /api/admin/costs", () => {
  const originalAdminEmails = process.env.ADMIN_EMAILS;

  afterEach(() => {
    process.env.ADMIN_EMAILS = originalAdminEmails;
  });

  it("rejects a non-admin user with 403", async () => {
    process.env.ADMIN_EMAILS = "admin@example.com";
    const { token } = await createUserWithToken({ email: "not-admin@example.com" });

    const res = await request(app).get("/api/admin/costs").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it("rejects when no ADMIN_EMAILS are configured, even for a plausible admin-looking email", async () => {
    delete process.env.ADMIN_EMAILS;
    const { token } = await createUserWithToken({ email: "admin@example.com" });

    const res = await request(app).get("/api/admin/costs").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it("returns aggregated spend by day and by user for an allowlisted admin", async () => {
    const { user: admin, token } = await createUserWithToken({ email: "admin@example.com" });
    process.env.ADMIN_EMAILS = "admin@example.com";

    const { user: otherUser } = await createUserWithToken({ email: "spender@example.com" });

    await LlmCall.create([
      { user: admin._id, feature: "chat", model: "gpt-4o-mini", costUsd: 0.01, totalTokens: 100 },
      { user: otherUser._id, feature: "quiz", model: "gpt-4o-mini", costUsd: 0.02, totalTokens: 200 },
      { user: otherUser._id, feature: "quiz", model: "gpt-4o-mini", costUsd: 0.03, totalTokens: 300 },
    ]);

    const res = await request(app).get("/api/admin/costs").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.totalCalls).toBe(3);
    expect(res.body.totalCostUsd).toBeCloseTo(0.06, 5);
    expect(res.body.byDay).toHaveLength(1);
    expect(res.body.byDay[0].calls).toBe(3);

    const spenderRow = res.body.byUser.find((row) => row.email === "spender@example.com");
    expect(spenderRow.calls).toBe(2);
    expect(spenderRow.costUsd).toBeCloseTo(0.05, 5);
  });

  it("clamps an out-of-range days query instead of trusting the client", async () => {
    const { token } = await createUserWithToken({ email: "admin@example.com" });
    process.env.ADMIN_EMAILS = "admin@example.com";

    const res = await request(app).get("/api/admin/costs?days=99999").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.days).toBeLessThanOrEqual(90);
  });
});
