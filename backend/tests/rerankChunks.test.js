import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../utils/aiClient.js", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, generate: vi.fn() };
});
import { generate } from "../utils/aiClient.js";
import { rerankChunks } from "../utils/rerank.js";
import { createUserWithToken } from "./helpers.js";

const manyCandidates = (n) => Array.from({ length: n }, (_, i) => ({ id: `c${i}`, text: `Chunk number ${i}.` }));

beforeEach(() => {
  generate.mockClear();
});

afterEach(() => {
  delete process.env.OPENAI_API_KEY;
});

describe("rerankChunks", () => {
  it("returns candidates unchanged (just truncated) when there are already <= limit of them", async () => {
    const candidates = manyCandidates(3);
    const result = await rerankChunks({ query: "q", candidates, limit: 6, userId: "u1" });

    expect(result).toEqual(candidates);
    expect(generate).not.toHaveBeenCalled();
  });

  it("falls back to the fused order, untouched, when OPENAI_API_KEY isn't configured", async () => {
    const candidates = manyCandidates(10);
    const result = await rerankChunks({ query: "q", candidates, limit: 3, userId: "u1" });

    expect(result.map((c) => c.id)).toEqual(["c0", "c1", "c2"]);
    expect(generate).not.toHaveBeenCalled();
  });

  it("reorders by the mocked model's scores when an API key is configured", async () => {
    process.env.OPENAI_API_KEY = "sk-test";
    const candidates = manyCandidates(5);
    generate.mockResolvedValue({
      scores: [
        { index: 0, score: 1 },
        { index: 1, score: 1 },
        { index: 2, score: 9 },
        { index: 3, score: 1 },
        { index: 4, score: 1 },
      ],
    });

    const result = await rerankChunks({ query: "q", candidates, limit: 3, userId: "u1", requestId: "req-1" });

    expect(result[0].id).toBe("c2");
    expect(result).toHaveLength(3);
  });

  it("falls back to the fused order when the model call throws", async () => {
    process.env.OPENAI_API_KEY = "sk-test";
    const candidates = manyCandidates(8);
    generate.mockRejectedValue(new Error("provider timeout"));

    const result = await rerankChunks({ query: "q", candidates, limit: 4, userId: "u1" });

    expect(result.map((c) => c.id)).toEqual(["c0", "c1", "c2", "c3"]);
  });

  it("returns nothing for an empty candidate list", async () => {
    expect(await rerankChunks({ query: "q", candidates: [], limit: 6, userId: "u1" })).toEqual([]);
  });

  it("records spend and a ledger row when reranking actually calls the model", async () => {
    process.env.OPENAI_API_KEY = "sk-test";
    const { user } = await createUserWithToken();
    generate.mockImplementation(async (prompt, opts) => {
      opts.onUsage({ costUsd: 0.002, usage: { prompt_tokens: 500, completion_tokens: 20, total_tokens: 520 }, model: "gpt-4o-mini", latencyMs: 40 });
      return { scores: [] };
    });

    const { default: LlmCall } = await import("../models/LlmCall.js");
    await rerankChunks({ query: "q", candidates: manyCandidates(10), limit: 3, userId: user._id, requestId: "req-2" });

    const rows = await LlmCall.find({ user: user._id, feature: "rerank" });
    expect(rows).toHaveLength(1);
    expect(rows[0].costUsd).toBe(0.002);
  });
});
