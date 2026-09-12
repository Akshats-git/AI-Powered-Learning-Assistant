import { describe, it, expect, vi, afterEach } from "vitest";
import request from "supertest";
import app from "../app.js";
import User from "../models/User.js";
import { decrypt } from "../utils/encryption.js";
import { createUserWithToken } from "./helpers.js";

vi.mock("../utils/verifyOpenAiKey.js", () => ({
  verifyOpenAiKey: vi.fn(),
}));
import { verifyOpenAiKey } from "../utils/verifyOpenAiKey.js";

describe("PUT /api/auth/api-key", () => {
  afterEach(() => {
    vi.mocked(verifyOpenAiKey).mockReset();
  });

  it("requires authentication", async () => {
    const res = await request(app).put("/api/auth/api-key").send({ apiKey: "sk-abcdefghijklmnopqrstuvwxyz" });
    expect(res.status).toBe(401);
  });

  it("rejects a key that doesn't look like an OpenAI key without calling OpenAI", async () => {
    const { token } = await createUserWithToken();

    const res = await request(app)
      .put("/api/auth/api-key")
      .set("Authorization", `Bearer ${token}`)
      .send({ apiKey: "not-a-key" });

    expect(res.status).toBe(400);
    expect(verifyOpenAiKey).not.toHaveBeenCalled();
  });

  it("rejects a well-formed key that OpenAI itself rejects", async () => {
    verifyOpenAiKey.mockRejectedValueOnce(new Error("401 Unauthorized"));
    const { token } = await createUserWithToken();

    const res = await request(app)
      .put("/api/auth/api-key")
      .set("Authorization", `Bearer ${token}`)
      .send({ apiKey: "sk-looksvalidbutisrevoked1234567890" });

    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/rejected/i);
  });

  it("saves a valid key, encrypted, and returns only the last 4 characters", async () => {
    verifyOpenAiKey.mockResolvedValueOnce(undefined);
    const { user, token } = await createUserWithToken();
    const apiKey = "sk-abcdefghijklmnopqrstuvwxyzABCD";

    const res = await request(app)
      .put("/api/auth/api-key")
      .set("Authorization", `Bearer ${token}`)
      .send({ apiKey });

    expect(res.status).toBe(200);
    expect(res.body.openaiApiKeyLast4).toBe("ABCD");
    expect(JSON.stringify(res.body)).not.toContain(apiKey);

    const stored = await User.findById(user._id).select("+openaiApiKeyEncrypted");
    expect(stored.openaiApiKeyLast4).toBe("ABCD");
    expect(stored.openaiApiKeyEncrypted).not.toContain(apiKey);
    expect(decrypt(stored.openaiApiKeyEncrypted)).toBe(apiKey);
  });

  it("never returns the encrypted key on the profile endpoint", async () => {
    verifyOpenAiKey.mockResolvedValueOnce(undefined);
    const { token } = await createUserWithToken();

    await request(app)
      .put("/api/auth/api-key")
      .set("Authorization", `Bearer ${token}`)
      .send({ apiKey: "sk-abcdefghijklmnopqrstuvwxyzABCD" });

    const profile = await request(app).get("/api/auth/profile").set("Authorization", `Bearer ${token}`);
    expect(profile.body.user.openaiApiKeyLast4).toBe("ABCD");
    expect(profile.body.user.openaiApiKeyEncrypted).toBeUndefined();
  });
});

describe("DELETE /api/auth/api-key", () => {
  it("removes a saved key", async () => {
    verifyOpenAiKey.mockResolvedValueOnce(undefined);
    const { user, token } = await createUserWithToken();

    await request(app)
      .put("/api/auth/api-key")
      .set("Authorization", `Bearer ${token}`)
      .send({ apiKey: "sk-abcdefghijklmnopqrstuvwxyzABCD" });

    const res = await request(app).delete("/api/auth/api-key").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);

    const reloaded = await User.findById(user._id).select("+openaiApiKeyEncrypted");
    expect(reloaded.openaiApiKeyEncrypted).toBeNull();
    expect(reloaded.openaiApiKeyLast4).toBeNull();
  });

  it("requires authentication", async () => {
    const res = await request(app).delete("/api/auth/api-key");
    expect(res.status).toBe(401);
  });
});
