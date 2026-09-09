import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../utils/aiClient.js", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, generate: vi.fn() };
});
import { generate } from "../utils/aiClient.js";
import { rewriteQuery, buildQueryRewritePrompt } from "../utils/queryRewrite.js";
import { createUserWithToken } from "./helpers.js";
import LlmCall from "../models/LlmCall.js";

const HISTORY = [
  { role: "user", content: "What organelles are in a cell?" },
  { role: "assistant", content: "The mitochondria and the nucleus, among others." },
];

beforeEach(() => {
  generate.mockClear();
});

afterEach(() => {
  delete process.env.OPENAI_API_KEY;
});

describe("buildQueryRewritePrompt", () => {
  it("includes the conversation history and the follow-up question", () => {
    const prompt = buildQueryRewritePrompt(HISTORY, "What does the second one do?");

    expect(prompt).toContain("User: What organelles are in a cell?");
    expect(prompt).toContain("Assistant: The mitochondria and the nucleus, among others.");
    expect(prompt).toContain("What does the second one do?");
  });
});

describe("rewriteQuery", () => {
  it("returns the original question unchanged when there's no history (first message)", async () => {
    const result = await rewriteQuery({ history: [], question: "What is this document about?", userId: "u1" });
    expect(result).toBe("What is this document about?");
    expect(generate).not.toHaveBeenCalled();
  });

  it("returns the original question unchanged when OPENAI_API_KEY isn't configured", async () => {
    const result = await rewriteQuery({ history: HISTORY, question: "What does the second one do?", userId: "u1" });
    expect(result).toBe("What does the second one do?");
    expect(generate).not.toHaveBeenCalled();
  });

  it("returns the rewritten standalone query from the model", async () => {
    process.env.OPENAI_API_KEY = "sk-test";
    generate.mockResolvedValue("What does the nucleus do?");

    const result = await rewriteQuery({ history: HISTORY, question: "What does the second one do?", userId: "u1" });
    expect(result).toBe("What does the nucleus do?");
  });

  it("strips surrounding quotes the model sometimes adds", async () => {
    process.env.OPENAI_API_KEY = "sk-test";
    generate.mockResolvedValue('"What does the nucleus do?"');

    const result = await rewriteQuery({ history: HISTORY, question: "the second one?", userId: "u1" });
    expect(result).toBe("What does the nucleus do?");
  });

  it("falls back to the original question when the model call throws", async () => {
    process.env.OPENAI_API_KEY = "sk-test";
    generate.mockRejectedValue(new Error("provider timeout"));

    const result = await rewriteQuery({ history: HISTORY, question: "the second one?", userId: "u1" });
    expect(result).toBe("the second one?");
  });

  it("falls back to the original question when the model returns an empty response", async () => {
    process.env.OPENAI_API_KEY = "sk-test";
    generate.mockResolvedValue("   ");

    const result = await rewriteQuery({ history: HISTORY, question: "the second one?", userId: "u1" });
    expect(result).toBe("the second one?");
  });

  it("records spend and a ledger row under feature 'query-rewrite' when it actually runs", async () => {
    process.env.OPENAI_API_KEY = "sk-test";
    const { user } = await createUserWithToken();
    generate.mockImplementation(async (prompt, opts) => {
      opts.onUsage({ costUsd: 0.0005, usage: { prompt_tokens: 80, completion_tokens: 10, total_tokens: 90 }, model: "gpt-4o-mini", latencyMs: 15 });
      return "Rewritten question.";
    });

    await rewriteQuery({ history: HISTORY, question: "the second one?", userId: user._id, requestId: "req-1" });

    const rows = await LlmCall.find({ user: user._id, feature: "query-rewrite" });
    expect(rows).toHaveLength(1);
    expect(rows[0].costUsd).toBe(0.0005);
  });
});
