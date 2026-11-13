import { describe, it, expect, vi } from "vitest";
import request from "supertest";
import app from "../app.js";
import Document from "../models/Document.js";
import ChatHistory from "../models/ChatHistory.js";
import { createUserWithToken } from "./helpers.js";

vi.mock("../utils/aiClient.js", async (importOriginal) => ({ ...(await importOriginal()), generate: vi.fn(async () => "Mocked answer.") }));

const makeDoc = (user) =>
  Document.create({ user, title: "Doc", fileName: "d.pdf", filePath: "/tmp/d.pdf", fileSize: 1, mimeType: "application/pdf", extractedText: "Some text to chat about.", hasExtractedText: true });
const auth = (token) => ({ Authorization: `Bearer ${token}` });

describe("chat history", () => {
  it("never stores more than 200 messages: the oldest fall off", async () => {
    process.env.OPENAI_API_KEY = "sk-test";
    const { user, token } = await createUserWithToken();
    const doc = await makeDoc(user._id);
    const old = Array.from({ length: 199 }, (_, i) => ({ role: i % 2 ? "assistant" : "user", content: `old ${i}` }));
    await ChatHistory.create({ user: user._id, document: doc._id, messages: old });

    const res = await request(app).post("/api/ai/chat").set(auth(token)).send({ documentId: doc._id.toString(), message: "newest question" });
    expect(res.status).toBe(200);

    const stored = await ChatHistory.findOne({ document: doc._id });
    expect(stored.messages).toHaveLength(200);
    expect(stored.messages[0].content).toBe("old 1");
    expect(stored.messages.at(-2).content).toBe("newest question");
    expect(stored.messages.at(-1).content).toBe("Mocked answer.");
  });

  it("DELETE clears the owner's conversation, and only theirs", async () => {
    const a = await createUserWithToken();
    const b = await createUserWithToken();
    const doc = await makeDoc(a.user._id);
    await ChatHistory.create({ user: a.user._id, document: doc._id, messages: [{ role: "user", content: "hi" }] });

    expect((await request(app).delete(`/api/ai/chat-history/${doc._id}`).set(auth(b.token))).status).toBe(404);
    expect(await ChatHistory.countDocuments({ document: doc._id })).toBe(1);

    expect((await request(app).delete(`/api/ai/chat-history/${doc._id}`).set(auth(a.token))).status).toBe(200);
    expect(await ChatHistory.countDocuments({ document: doc._id })).toBe(0);
    expect((await request(app).get(`/api/ai/chat-history/${doc._id}`).set(auth(a.token))).body).toEqual([]);
  });

  it("loading history doesn't use up the AI rate limit", async () => {
    const { user, token } = await createUserWithToken();
    const doc = await makeDoc(user._id);
    for (let i = 0; i < 35; i += 1) {
      const res = await request(app).get(`/api/ai/chat-history/${doc._id}`).set(auth(token));
      expect(res.status).toBe(200);
    }
  });
});
