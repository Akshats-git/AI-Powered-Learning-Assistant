import LlmCall from "../models/LlmCall.js";

const DEFAULT_DAYS = 30;
const MAX_DAYS = 90;

const parseDays = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_DAYS;
  return Math.min(parsed, MAX_DAYS);
};

// Spend per user per day, plus the totals that make the breakdown legible —
// the admin page this backs is read-only, so a couple of aggregation
// pipelines beat standing up a real data warehouse for it.
export const getCostOverview = async (req, res, next) => {
  try {
    const days = parseDays(req.query.days);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const match = { createdAt: { $gte: since } };

    const [byDay, byUser, totals] = await Promise.all([
      LlmCall.aggregate([
        { $match: match },
        {
          $group: {
            _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
            costUsd: { $sum: { $ifNull: ["$costUsd", 0] } },
            calls: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
        { $project: { _id: 0, date: "$_id", costUsd: 1, calls: 1 } },
      ]),
      LlmCall.aggregate([
        { $match: match },
        {
          $group: {
            _id: "$user",
            costUsd: { $sum: { $ifNull: ["$costUsd", 0] } },
            calls: { $sum: 1 },
            totalTokens: { $sum: { $ifNull: ["$totalTokens", 0] } },
          },
        },
        { $sort: { costUsd: -1 } },
        { $limit: 50 },
        {
          $lookup: {
            from: "users",
            localField: "_id",
            foreignField: "_id",
            as: "user",
          },
        },
        { $unwind: { path: "$user", preserveNullAndEmptyArrays: true } },
        {
          $project: {
            _id: 0,
            userId: "$_id",
            email: "$user.email",
            username: "$user.username",
            costUsd: 1,
            calls: 1,
            totalTokens: 1,
          },
        },
      ]),
      LlmCall.aggregate([
        { $match: match },
        {
          $group: {
            _id: null,
            costUsd: { $sum: { $ifNull: ["$costUsd", 0] } },
            calls: { $sum: 1 },
          },
        },
      ]),
    ]);

    res.status(200).json({
      days,
      totalCostUsd: totals[0]?.costUsd || 0,
      totalCalls: totals[0]?.calls || 0,
      byDay,
      byUser,
    });
  } catch (err) {
    next(err);
  }
};
