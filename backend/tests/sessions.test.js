import { describe, it, expect } from "vitest";
import request from "supertest";
import app from "../app.js";

const auth = (req, token) => req.set("Authorization", `Bearer ${token}`);

describe("sessions", () => {
  it("lists the active session created at registration, flagged as current", async () => {
    const agent = request.agent(app);
    const registerRes = await agent
      .post("/api/auth/register")
      .send({ username: "Mona", email: "mona@example.com", password: "correct-password" });

    const res = await auth(agent.get("/api/auth/sessions"), registerRes.body.token);
    expect(res.status).toBe(200);
    expect(res.body.sessions).toHaveLength(1);
    expect(res.body.sessions[0].isCurrent).toBe(true);
    expect(res.body.sessions[0].familyId).toBeTruthy();
  });

  it("lists a second login as a separate, non-current session from the first device's point of view", async () => {
    const email = "nate@example.com";
    const deviceA = request.agent(app);
    const registerRes = await deviceA
      .post("/api/auth/register")
      .send({ username: "Nate", email, password: "correct-password" });

    const deviceB = request.agent(app);
    await deviceB.post("/api/auth/login").send({ email, password: "correct-password" });

    const res = await auth(deviceA.get("/api/auth/sessions"), registerRes.body.token);
    expect(res.status).toBe(200);
    expect(res.body.sessions).toHaveLength(2);
    expect(res.body.sessions.filter((s) => s.isCurrent)).toHaveLength(1);
  });

  it("rejects listing sessions with no access token", async () => {
    const res = await request(app).get("/api/auth/sessions");
    expect(res.status).toBe(401);
  });

  it("revokes another device's session, which then fails to refresh", async () => {
    const email = "olga@example.com";
    const deviceA = request.agent(app);
    const registerRes = await deviceA
      .post("/api/auth/register")
      .send({ username: "Olga", email, password: "correct-password" });

    const deviceB = request.agent(app);
    const loginRes = await deviceB.post("/api/auth/login").send({ email, password: "correct-password" });

    const listRes = await auth(deviceA.get("/api/auth/sessions"), registerRes.body.token);
    const otherSession = listRes.body.sessions.find((s) => !s.isCurrent);
    expect(otherSession).toBeTruthy();

    const revokeRes = await auth(deviceA.delete(`/api/auth/sessions/${otherSession.familyId}`), registerRes.body.token);
    expect(revokeRes.status).toBe(200);

    const refreshRes = await deviceB.post("/api/auth/refresh").set("X-CSRF-Token", loginRes.body.csrfToken);
    expect(refreshRes.status).toBe(401);
  });

  it("clears the caller's own cookies when it revokes its own current session", async () => {
    const agent = request.agent(app);
    const registerRes = await agent
      .post("/api/auth/register")
      .send({ username: "Percy", email: "percy@example.com", password: "correct-password" });

    const familyRes = await auth(agent.get("/api/auth/sessions"), registerRes.body.token);
    const familyId = familyRes.body.sessions[0].familyId;

    const revokeRes = await auth(agent.delete(`/api/auth/sessions/${familyId}`), registerRes.body.token);
    expect(revokeRes.status).toBe(200);
    expect(revokeRes.headers["set-cookie"]?.some((c) => /^refreshToken=;/.test(c))).toBe(true);

    const refreshRes = await agent.post("/api/auth/refresh").set("X-CSRF-Token", registerRes.body.csrfToken);
    expect(refreshRes.status).toBe(401);
  });

  it("404s revoking a session that doesn't belong to the caller", async () => {
    const agentA = request.agent(app);
    const registerA = await agentA
      .post("/api/auth/register")
      .send({ username: "Quinn", email: "quinn@example.com", password: "correct-password" });

    const agentB = request.agent(app);
    const registerB = await agentB
      .post("/api/auth/register")
      .send({ username: "Ray", email: "ray@example.com", password: "correct-password" });

    const bSessions = await auth(agentB.get("/api/auth/sessions"), registerB.body.token);
    const bFamilyId = bSessions.body.sessions[0].familyId;

    const res = await auth(agentA.delete(`/api/auth/sessions/${bFamilyId}`), registerA.body.token);
    expect(res.status).toBe(404);
  });

  it("400s revoking a session with a malformed familyId", async () => {
    const agent = request.agent(app);
    const registerRes = await agent
      .post("/api/auth/register")
      .send({ username: "Sam", email: "sam@example.com", password: "correct-password" });

    const res = await auth(agent.delete("/api/auth/sessions/not-a-uuid"), registerRes.body.token);
    expect(res.status).toBe(400);
  });
});
