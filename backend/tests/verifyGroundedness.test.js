import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../utils/aiClient.js", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, generate: vi.fn() };
});
import { generate } from "../utils/aiClient.js";
import { verifyGroundedness } from "../utils/groundedness.js";
import { createUserWithToken } from "./helpers.js";
import LlmCall from "../models/LlmCall.js";

beforeEach(() => {
  generate.mockClear();
});

afterEach(() => {
  delete process.env.OPENAI_API_KEY;
});

describe("verifyGroundedness", () => {
  it("returns null without calling the model when OPENAI_API_KEY isn't configured", async () => {
    const result = await verifyGroundedness({ answer: "Some answer.", context: "Some excerpt.", userId: "u1" });
    expect(result).toBeNull();
    expect(generate).not.toHaveBeenCalled();
  });

  it("returns null for an empty answer or context without calling the model", async () => {
    process.env.OPENAI_API_KEY = "sk-test";
    expect(await verifyGroundedness({ answer: "", context: "x", userId: "u1" })).toBeNull();
    expect(await verifyGroundedness({ answer: "x", context: "  ", userId: "u1" })).toBeNull();
    expect(generate).not.toHaveBeenCalled();
  });

  it("returns the parsed verdict from a mocked model response", async () => {
    process.env.OPENAI_API_KEY = "sk-test";
    generate.mockResolvedValue({ grounded: false, unsupportedClaims: ["A fabricated detail."] });

    const result = await verifyGroundedness({ answer: "Answer with a fabricated detail.", context: "Real excerpt.", userId: "u1" });

    expect(result).toEqual({ grounded: false, unsupportedClaims: ["A fabricated detail."] });
  });

  it("degrades to null (not a false 'ungrounded') when the model call throws", async () => {
    process.env.OPENAI_API_KEY = "sk-test";
    generate.mockRejectedValue(new Error("provider timeout"));

    const result = await verifyGroundedness({ answer: "Answer.", context: "Excerpt.", userId: "u1" });
    expect(result).toBeNull();
  });

  it("degrades to null when the model returns a malformed response", async () => {
    process.env.OPENAI_API_KEY = "sk-test";
    generate.mockResolvedValue({ nonsense: true });

    const result = await verifyGroundedness({ answer: "Answer.", context: "Excerpt.", userId: "u1" });
    expect(result).toBeNull();
  });

  it("records spend and a ledger row under feature 'groundedness' when it actually runs", async () => {
    process.env.OPENAI_API_KEY = "sk-test";
    const { user } = await createUserWithToken();
    generate.mockImplementation(async (prompt, opts) => {
      opts.onUsage({ costUsd: 0.001, usage: { prompt_tokens: 200, completion_tokens: 30, total_tokens: 230 }, model: "gpt-4o-mini", latencyMs: 20 });
      return { grounded: true, unsupportedClaims: [] };
    });

    await verifyGroundedness({ answer: "Answer.", context: "Excerpt.", userId: user._id, requestId: "req-1" });

    const rows = await LlmCall.find({ user: user._id, feature: "groundedness" });
    expect(rows).toHaveLength(1);
    expect(rows[0].costUsd).toBe(0.001);
  });
});
