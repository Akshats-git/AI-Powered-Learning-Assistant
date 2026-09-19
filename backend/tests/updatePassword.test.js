import { describe, it, expect } from "vitest";
import request from "supertest";
import app from "../app.js";

const OLD = "old-password-123";
const NEW = "new-password-456";

const registerAgent = async (email) => {
  const agent = request.agent(app);
  const res = await agent.post("/api/auth/register").send({ username: "Pat", email, password: OLD });
  return { agent, token: res.body.token, csrf: res.body.csrfToken };
};

const loginAgent = async (email, password = OLD) => {
  const agent = request.agent(app);
  const res = await agent.post("/api/auth/login").send({ email, password });
  return { agent, token: res.body.token, csrf: res.body.csrfToken };
};

describe("PUT /api/auth/update-password", () => {
  it("rejects a wrong current password with 400 (not 401, so the client doesn't force a logout)", async () => {
    const { agent, token } = await registerAgent("wrong@example.com");
    const res = await agent.put("/api/auth/update-password").set("Authorization", `Bearer ${token}`).send({ currentPassword: "nope-nope-nope", newPassword: NEW });
    expect(res.status).toBe(400);
  });

  it("changes the password: the new one logs in and the old one no longer does", async () => {
    const { agent, token } = await registerAgent("change@example.com");
    const res = await agent.put("/api/auth/update-password").set("Authorization", `Bearer ${token}`).send({ currentPassword: OLD, newPassword: NEW });
    expect(res.status).toBe(200);

    expect((await request(app).post("/api/auth/login").send({ email: "change@example.com", password: NEW })).status).toBe(200);
    expect((await request(app).post("/api/auth/login").send({ email: "change@example.com", password: OLD })).status).toBe(401);
  });

  it("signs out every OTHER device but keeps the one that made the change", async () => {
    const email = "sessions@example.com";
    const phone = await registerAgent(email);
    const laptop = await loginAgent(email);

    const res = await laptop.agent.put("/api/auth/update-password").set("Authorization", `Bearer ${laptop.token}`).send({ currentPassword: OLD, newPassword: NEW });
    expect(res.status).toBe(200);

    const phoneRefresh = await phone.agent.post("/api/auth/refresh").set("X-CSRF-Token", phone.csrf);
    expect(phoneRefresh.status).toBe(401);

    const laptopRefresh = await laptop.agent.post("/api/auth/refresh").set("X-CSRF-Token", laptop.csrf);
    expect(laptopRefresh.status).toBe(200);
  });

  it("with no refresh cookie to identify the caller's own session, revokes them all", async () => {
    const email = "nocookie@example.com";
    const device = await registerAgent(email);

    const res = await request(app).put("/api/auth/update-password").set("Authorization", `Bearer ${device.token}`).send({ currentPassword: OLD, newPassword: NEW });
    expect(res.status).toBe(200);

    expect((await device.agent.post("/api/auth/refresh").set("X-CSRF-Token", device.csrf)).status).toBe(401);
  });
});
