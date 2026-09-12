import { describe, it, expect, afterEach } from "vitest";
import { assertWithinBudget, recordSpend } from "../utils/aiBudget.js";
import { runWithApiKey } from "../utils/aiContext.js";
import User from "../models/User.js";
import { createUserWithToken } from "./helpers.js";

const ORIGINAL_BUDGET_ENV = process.env.MONTHLY_AI_BUDGET_USD;

describe("aiBudget", () => {
  afterEach(() => {
    if (ORIGINAL_BUDGET_ENV === undefined) delete process.env.MONTHLY_AI_BUDGET_USD;
    else process.env.MONTHLY_AI_BUDGET_USD = ORIGINAL_BUDGET_ENV;
  });

  it("does nothing when no budget is configured", async () => {
    delete process.env.MONTHLY_AI_BUDGET_USD;
    const { user } = await createUserWithToken();
    await expect(assertWithinBudget(user._id)).resolves.toBeUndefined();
  });

  it("allows spending under the configured budget", async () => {
    process.env.MONTHLY_AI_BUDGET_USD = "1";
    const { user } = await createUserWithToken();

    await recordSpend(user._id, 0.5);
    await expect(assertWithinBudget(user._id)).resolves.toBeUndefined();
  });

  it("rejects once the configured budget is reached", async () => {
    process.env.MONTHLY_AI_BUDGET_USD = "1";
    const { user } = await createUserWithToken();

    await recordSpend(user._id, 1.2);
    await expect(assertWithinBudget(user._id)).rejects.toThrow(/budget/i);
  });

  it("accumulates spend across multiple calls in the same month", async () => {
    process.env.MONTHLY_AI_BUDGET_USD = "1";
    const { user } = await createUserWithToken();

    await recordSpend(user._id, 0.4);
    await recordSpend(user._id, 0.4);
    await expect(assertWithinBudget(user._id)).resolves.toBeUndefined();

    await recordSpend(user._id, 0.4);
    await expect(assertWithinBudget(user._id)).rejects.toThrow(/budget/i);
  });

  it("ignores a zero or missing cost", async () => {
    process.env.MONTHLY_AI_BUDGET_USD = "1";
    const { user } = await createUserWithToken();

    await recordSpend(user._id, 0);
    await recordSpend(user._id, null);
    await expect(assertWithinBudget(user._id)).resolves.toBeUndefined();
  });

  it("never caps or records spend when the active key is the user's own", async () => {
    process.env.MONTHLY_AI_BUDGET_USD = "1";
    const { user } = await createUserWithToken();

    await runWithApiKey({ apiKey: "sk-own-key", keySource: "own" }, async () => {
      await recordSpend(user._id, 50); // way over the $1 cap
      await expect(assertWithinBudget(user._id)).resolves.toBeUndefined();
    });

    // recordSpend should have been a no-op — nothing written to the user's
    // running total at all.
    const reloaded = await User.findById(user._id);
    expect(reloaded.aiUsage.spendUsd).toBe(0);
  });
});
