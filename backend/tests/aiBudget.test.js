import { describe, it, expect, afterEach } from "vitest";
import { assertWithinBudget, recordSpend } from "../utils/aiBudget.js";
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
});
