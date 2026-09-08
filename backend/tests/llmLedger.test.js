import { describe, it, expect } from "vitest";
import { recordLlmCall } from "../utils/llmLedger.js";
import LlmCall from "../models/LlmCall.js";
import { createUserWithToken } from "./helpers.js";

describe("recordLlmCall", () => {
  it("persists a ledger row from an aiClient usage payload", async () => {
    const { user } = await createUserWithToken();

    await recordLlmCall(user._id, "req-123", "chat", {
      model: "gpt-4o-mini",
      usage: { prompt_tokens: 100, completion_tokens: 40, total_tokens: 140 },
      costUsd: 0.0002,
      latencyMs: 850,
    });

    const rows = await LlmCall.find({ user: user._id });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      feature: "chat",
      model: "gpt-4o-mini",
      promptTokens: 100,
      completionTokens: 40,
      totalTokens: 140,
      costUsd: 0.0002,
      latencyMs: 850,
      requestId: "req-123",
    });
  });

  it("does nothing when there's no usage info (the call never reached the provider)", async () => {
    const { user } = await createUserWithToken();
    await recordLlmCall(user._id, "req-456", "summary", null);
    expect(await LlmCall.countDocuments({ user: user._id })).toBe(0);
  });
});
