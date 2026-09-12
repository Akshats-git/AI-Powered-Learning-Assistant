import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";

// Mocks the OpenAI SDK itself (not aiClient.js) so this test can assert
// exactly which apiKey the client was constructed with — the thing
// aiClient.js's getClient() is actually responsible for getting right now
// that it can be either a user's own key or the deployer's shared one.
// vi.mock's factory is hoisted above imports, so the mocks it references
// have to come from vi.hoisted() rather than plain top-level consts.
const { mockCreate, OpenAIMock } = vi.hoisted(() => {
  const mockCreate = vi.fn();
  // A plain function, not an arrow — `new OpenAI(...)` in aiClient.js means
  // this has to be constructible, which an arrow function can't be.
  const OpenAIMock = vi.fn(function (opts) {
    this.apiKey = opts.apiKey;
    this.chat = { completions: { create: mockCreate } };
  });
  return { mockCreate, OpenAIMock };
});
vi.mock("openai", () => ({ default: OpenAIMock }));

import { generate } from "../utils/aiClient.js";
import { runWithApiKey } from "../utils/aiContext.js";

const ORIGINAL_ENV_KEY = process.env.OPENAI_API_KEY;

describe("aiClient key resolution", () => {
  beforeEach(() => {
    OpenAIMock.mockClear();
    mockCreate.mockReset();
    mockCreate.mockResolvedValue({ choices: [{ message: { content: "ok" } }], usage: {} });
    delete process.env.OPENAI_API_KEY;
  });

  afterAll(() => {
    if (ORIGINAL_ENV_KEY === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = ORIGINAL_ENV_KEY;
  });

  it("throws a clear, user-actionable error when no key is available anywhere", async () => {
    await expect(generate("hi")).rejects.toThrow(/No OpenAI API key/);
    expect(OpenAIMock).not.toHaveBeenCalled();
  });

  it("falls back to the shared env key when there's no request-scoped context", async () => {
    process.env.OPENAI_API_KEY = "sk-env-shared";
    await generate("hi");
    expect(OpenAIMock).toHaveBeenCalledWith({ apiKey: "sk-env-shared" });
  });

  it("prefers the requesting user's own key over the shared fallback", async () => {
    process.env.OPENAI_API_KEY = "sk-env-shared";
    await runWithApiKey({ apiKey: "sk-users-own", keySource: "own" }, async () => {
      await generate("hi");
    });
    expect(OpenAIMock).toHaveBeenCalledWith({ apiKey: "sk-users-own" });
  });

  it("uses the shared key inside a context where the user has none of their own", async () => {
    await runWithApiKey({ apiKey: "sk-env-shared", keySource: "shared" }, async () => {
      await generate("hi");
    });
    expect(OpenAIMock).toHaveBeenCalledWith({ apiKey: "sk-env-shared" });
  });
});
