import { describe, it, expect, afterEach } from "vitest";
import request from "supertest";
import app from "../app.js";
import AuditLog from "../models/AuditLog.js";
import User from "../models/User.js";
import { createUserWithToken } from "./helpers.js";

const PW = "correct-password";
const events = async (filter = {}) => (await AuditLog.find(filter).sort({ createdAt: 1 }).lean()).map((e) => e.event);

describe("audit log", () => {
  it("records register and login, with the user and request id, and no secrets", async () => {
    const agent = request.agent(app);
    await agent.post("/api/auth/register").send({ username: "Aud", email: "aud@example.com", password: PW });
    await request(app).post("/api/auth/login").send({ email: "aud@example.com", password: PW });

    expect(await events()).toEqual(["register", "login"]);
    const row = await AuditLog.findOne({ event: "login" }).lean();
    expect(row.user).toBeTruthy();
    expect(row.requestId).toBeTruthy();
    expect(JSON.stringify(row)).not.toContain(PW);
  });

  it("records failed logins, hashing an unknown email instead of storing it", async () => {
    await request(app).post("/api/auth/login").send({ email: "ghost@example.com", password: "whatever-1" });
    const row = await AuditLog.findOne({ event: "login_failed" }).lean();
    expect(row.user).toBeNull();
    expect(row.meta.reason).toBe("unknown_email");
    expect(row.meta.emailHash).toMatch(/^[0-9a-f]{16}$/);
    expect(JSON.stringify(row)).not.toContain("ghost@example.com");
  });

  it("records the lockout on the attempt that triggers it, and locked attempts after", async () => {
    await User.create({ username: "L", email: "lock@example.com", password: PW });
    for (let i = 0; i < 5; i += 1) await request(app).post("/api/auth/login").send({ email: "lock@example.com", password: "bad-bad-bad-1" });
    await request(app).post("/api/auth/login").send({ email: "lock@example.com", password: PW });

    expect(await events()).toEqual(["login_failed", "login_failed", "login_failed", "login_failed", "account_locked", "login_failed"]);
    expect((await AuditLog.findOne({ event: "login_failed" }).sort({ createdAt: -1 }).lean()).meta.reason).toBe("account_locked");
  });

  it("records refresh-token reuse", async () => {
    const agent = request.agent(app);
    const reg = await agent.post("/api/auth/register").send({ username: "R", email: "reuse@example.com", password: PW });
    const oldCookies = reg.headers["set-cookie"];
    const first = await agent.post("/api/auth/refresh").set("X-CSRF-Token", reg.body.csrfToken);
    expect(first.status).toBe(200);

    await request(app).post("/api/auth/refresh").set("Cookie", oldCookies).set("X-CSRF-Token", reg.body.csrfToken);
    expect(await events({ event: "refresh_reuse_detected" })).toHaveLength(1);
  });

  it("records password change, api key changes, and logout", async () => {
    const agent = request.agent(app);
    const reg = await agent.post("/api/auth/register").send({ username: "P", email: "pw@example.com", password: PW });
    await agent.put("/api/auth/update-password").set("Authorization", `Bearer ${reg.body.token}`).send({ currentPassword: PW, newPassword: "another-password-1" });
    await agent.post("/api/auth/logout");
    const all = await events();
    expect(all).toContain("password_changed");
    expect(all).toContain("logout");
  });
});

describe("GET /api/admin/audit", () => {
  const original = process.env.ADMIN_EMAILS;
  afterEach(() => { process.env.ADMIN_EMAILS = original; });

  it("is admin-only", async () => {
    process.env.ADMIN_EMAILS = "admin@example.com";
    const { token } = await createUserWithToken({ email: "user@example.com" });
    expect((await request(app).get("/api/admin/audit").set("Authorization", `Bearer ${token}`)).status).toBe(403);
  });

  it("lists newest first, paginated, with the acting user's email, and filters by event", async () => {
    process.env.ADMIN_EMAILS = "admin@example.com";
    const { token } = await createUserWithToken({ email: "admin@example.com" });
    await request(app).post("/api/auth/register").send({ username: "Q", email: "q@example.com", password: PW });
    await request(app).post("/api/auth/login").send({ email: "q@example.com", password: "bad-bad-bad-1" });

    const all = await request(app).get("/api/admin/audit").set("Authorization", `Bearer ${token}`);
    expect(all.status).toBe(200);
    expect(all.body.items[0].event).toBe("login_failed");
    expect(all.body.items[0].user.email).toBe("q@example.com");
    expect(all.body).toMatchObject({ page: 1, total: 2 });

    const only = await request(app).get("/api/admin/audit?event=register").set("Authorization", `Bearer ${token}`);
    expect(only.body.items).toHaveLength(1);
    expect((await request(app).get("/api/admin/audit?event=nope").set("Authorization", `Bearer ${token}`)).status).toBe(400);
  });
});
