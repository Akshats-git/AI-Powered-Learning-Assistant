import User from "../models/User.js";

// One scripted user with a valid token can otherwise run an unbounded OpenAI
// bill through the AI rate limiter alone (it limits requests, not dollars).
// This caps actual spend per user per calendar month; unset the env var to
// disable it entirely.
const currentMonthKey = () => new Date().toISOString().slice(0, 7); // "2026-09"

const getBudgetLimitUsd = () => {
  const raw = process.env.MONTHLY_AI_BUDGET_USD;
  if (!raw) return null;
  const parsed = parseFloat(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const currentSpend = (user) => {
  const month = currentMonthKey();
  return user?.aiUsage?.month === month ? user.aiUsage.spendUsd : 0;
};

export const assertWithinBudget = async (userId) => {
  const limit = getBudgetLimitUsd();
  if (limit === null) return;

  const user = await User.findById(userId).select("aiUsage");
  if (currentSpend(user) >= limit) {
    const err = new Error(
      `Monthly AI budget of $${limit.toFixed(2)} has been reached. It resets at the start of next month.`
    );
    err.statusCode = 429;
    throw err;
  }
};

export const recordSpend = async (userId, costUsd) => {
  if (!costUsd || costUsd <= 0) return;

  const month = currentMonthKey();
  const user = await User.findById(userId).select("aiUsage");
  if (!user) return;

  if (user.aiUsage?.month === month) {
    await User.updateOne({ _id: userId }, { $inc: { "aiUsage.spendUsd": costUsd } });
  } else {
    await User.updateOne({ _id: userId }, { $set: { aiUsage: { month, spendUsd: costUsd } } });
  }
};
