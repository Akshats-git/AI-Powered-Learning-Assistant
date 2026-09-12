import { describe, it, expect, vi, afterEach } from "vitest";
import request from "supertest";
import app from "../app.js";
import Document from "../models/Document.js";
import { createUserWithToken } from "./helpers.js";

vi.mock("../utils/verifyOpenAiKey.js", () => ({ verifyOpenAiKey: vi.fn() }));
import { verifyOpenAiKey } from "../utils/verifyOpenAiKey.js";

// Captures what utils/aiContext.js resolved for *this* request, from inside
// the actual call site (aiClient.generate) rather than reaching into
// middleware internals — proving attachAiKeyContext really did thread the
// right key all the way through a real HTTP request, not just that it ran.
let captured;
vi.mock("../utils/aiClient.js", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    generate: vi.fn(async () => {
      const { getActiveApiKey, getActiveKeySource } = await import("../utils/aiContext.js");
      captured = { apiKey: getActiveApiKey(), keySource: getActiveKeySource() };
      return "Mocked summary.";
    }),
  };
});

const makeDocument = (userId) =>
  Document.create({
    user: userId,
    title: "Doc",
    fileName: "doc.pdf",
    filePath: "/tmp/doc.pdf",
    fileSize: 10,
    mimeType: "application/pdf",
    extractedText: "Some real extracted text for a summary to run against.",
    hasExtractedText: true,
  });

const ORIGINAL_ENV_KEY = process.env.OPENAI_API_KEY;

describe("attachAiKeyContext wiring through a real request", () => {
  afterEach(() => {
    if (ORIGINAL_ENV_KEY === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = ORIGINAL_ENV_KEY;
    verifyOpenAiKey.mockReset();
    captured = undefined;
  });

  it("uses the shared env key for a user who hasn't saved their own", async () => {
    process.env.OPENAI_API_KEY = "sk-env-shared";
    const { user, token } = await createUserWithToken();
    const document = await makeDocument(user._id);

    const res = await request(app)
      .post("/api/ai/summary")
      .set("Authorization", `Bearer ${token}`)
      .send({ documentId: document._id.toString() });

    expect(res.status).toBe(200);
    expect(captured).toEqual({ apiKey: "sk-env-shared", keySource: "shared" });
  });

  it("prefers the user's own saved key over the shared fallback", async () => {
    process.env.OPENAI_API_KEY = "sk-env-shared";
    verifyOpenAiKey.mockResolvedValueOnce(undefined);
    const { user, token } = await createUserWithToken();

    await request(app)
      .put("/api/auth/api-key")
      .set("Authorization", `Bearer ${token}`)
      .send({ apiKey: "sk-users-own-key-12345678" });

    const document = await makeDocument(user._id);

    const res = await request(app)
      .post("/api/ai/summary")
      .set("Authorization", `Bearer ${token}`)
      .send({ documentId: document._id.toString() });

    expect(res.status).toBe(200);
    expect(captured).toEqual({ apiKey: "sk-users-own-key-12345678", keySource: "own" });
  });

  it("has no active key when neither the user nor the deployer has configured one", async () => {
    delete process.env.OPENAI_API_KEY;
    const { user, token } = await createUserWithToken();
    const document = await makeDocument(user._id);

    const res = await request(app)
      .post("/api/ai/summary")
      .set("Authorization", `Bearer ${token}`)
      .send({ documentId: document._id.toString() });

    expect(res.status).toBe(200);
    expect(captured).toEqual({ apiKey: null, keySource: null });
  });
});
