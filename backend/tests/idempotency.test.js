import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import app from "../app.js";
import Document from "../models/Document.js";
import Flashcard from "../models/Flashcard.js";
import IdempotencyKey from "../models/IdempotencyKey.js";
import { createUserWithToken } from "./helpers.js";

vi.mock("../utils/aiClient.js", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    generate: vi.fn(async () => {
      generate.calls += 1;
      if (generate.fail) throw Object.assign(new Error("provider down"), { statusCode: 502 });
      if (generate.delayMs) await new Promise((r) => setTimeout(r, generate.delayMs));
      return { flashcards: [{ question: "q", answer: "a", difficulty: "easy" }] };
    }),
  };
});
import { generate } from "../utils/aiClient.js";

beforeEach(() => {
  generate.calls = 0;
  generate.fail = false;
  generate.delayMs = 0;
});

const makeDoc = (userId) =>
  Document.create({ user: userId, title: "D", fileName: "d.pdf", filePath: "/tmp/d.pdf", fileSize: 1, mimeType: "application/pdf", extractedText: "Some text.", hasExtractedText: true });

const post = (token, body, key) => {
  const r = request(app).post("/api/ai/generate-flashcards").set("Authorization", `Bearer ${token}`);
  return (key ? r.set("Idempotency-Key", key) : r).send(body);
};

describe("Idempotency-Key", () => {
  it("does nothing special without the header (two requests, two sets)", async () => {
    const { user, token } = await createUserWithToken();
    const doc = await makeDoc(user._id);
    await post(token, { documentId: doc._id.toString() });
    await post(token, { documentId: doc._id.toString() });
    expect(await Flashcard.countDocuments({ document: doc._id })).toBe(2);
    expect(generate.calls).toBe(2);
  });

  it("replays the stored response for a repeated key: same body, no second LLM call, no second set", async () => {
    const { user, token } = await createUserWithToken();
    const doc = await makeDoc(user._id);
    const body = { documentId: doc._id.toString() };

    const first = await post(token, body, "retry-key-0001");
    const second = await post(token, body, "retry-key-0001");

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.body._id).toBe(first.body._id);
    expect(second.headers["idempotent-replay"]).toBe("true");
    expect(first.headers["idempotent-replay"]).toBeUndefined();
    expect(generate.calls).toBe(1);
    expect(await Flashcard.countDocuments({ document: doc._id })).toBe(1);
  });

  it("rejects the same key reused for a different request with 422", async () => {
    const { user, token } = await createUserWithToken();
    const doc = await makeDoc(user._id);
    await post(token, { documentId: doc._id.toString(), count: 3 }, "retry-key-0002");
    const res = await post(token, { documentId: doc._id.toString(), count: 9 }, "retry-key-0002");
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("IDEMPOTENCY_KEY_REUSED");
  });

  it("returns 409 while the first request with that key is still running", async () => {
    const { user, token } = await createUserWithToken();
    const doc = await makeDoc(user._id);
    generate.delayMs = 400;
    const body = { documentId: doc._id.toString() };

    const first = post(token, body, "retry-key-0003").then((r) => r);
    await new Promise((r) => setTimeout(r, 100));
    const concurrent = await post(token, body, "retry-key-0003");
    expect(concurrent.status).toBe(409);
    expect(concurrent.body.error.code).toBe("REQUEST_IN_PROGRESS");
    expect((await first).status).toBe(201);
  });

  it("releases the key after a failure so the client can retry", async () => {
    const { user, token } = await createUserWithToken();
    const doc = await makeDoc(user._id);
    const body = { documentId: doc._id.toString() };

    generate.fail = true;
    expect((await post(token, body, "retry-key-0004")).status).toBe(502);
    expect(await IdempotencyKey.countDocuments({ key: "retry-key-0004" })).toBe(0);

    generate.fail = false;
    const retry = await post(token, body, "retry-key-0004");
    expect(retry.status).toBe(201);
    expect(await Flashcard.countDocuments({ document: doc._id })).toBe(1);
  });

  it("scopes keys per user: another user's identical key is a different request", async () => {
    const a = await createUserWithToken();
    const b = await createUserWithToken();
    const docA = await makeDoc(a.user._id);
    const docB = await makeDoc(b.user._id);

    await post(a.token, { documentId: docA._id.toString() }, "shared-key-0005");
    const res = await post(b.token, { documentId: docB._id.toString() }, "shared-key-0005");
    expect(res.status).toBe(201);
    expect(res.headers["idempotent-replay"]).toBeUndefined();
  });

  it("rejects a malformed key with 400", async () => {
    const { user, token } = await createUserWithToken();
    const doc = await makeDoc(user._id);
    const res = await post(token, { documentId: doc._id.toString() }, "short");
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("INVALID_IDEMPOTENCY_KEY");
  });
});
