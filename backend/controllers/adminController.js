import LlmCall from "../models/LlmCall.js";
import AuditLog from "../models/AuditLog.js";
import { AUDIT_EVENTS } from "../utils/audit.js";
import { parsePagination, buildPageMeta } from "../utils/pagination.js";

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
    // Only calls billed to the deployer's own OPENAI_API_KEY — a user
    // spending their own saved key (keySource "own") costs the deployer
    // nothing and would otherwise inflate this dashboard with spend that
    // was never actually on their bill.
    const billedToDeployer = { createdAt: { $gte: since }, keySource: { $ne: "own" } };
    // Cache hits are ledger rows too (see recordCacheHit) but aren't provider
    // calls — keep them out of the call and spend figures, and report them
    // separately below.
    const match = { ...billedToDeployer, cacheHit: { $ne: true } };

    const [byDay, byUser, totals, cacheRows] = await Promise.all([
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
      // A cacheable request is either a hit (a cacheHit row) or a miss (the
      // ordinary chat/summary row it generated instead) — so the hit rate is
      // hits over both.
      LlmCall.aggregate([
        { $match: { ...billedToDeployer, feature: { $in: ["chat", "summary"] } } },
        { $group: { _id: { $ifNull: ["$cacheHit", false] }, n: { $sum: 1 } } },
      ]),
    ]);

    const hits = cacheRows.find((r) => r._id === true)?.n || 0;
    const misses = cacheRows.find((r) => r._id === false)?.n || 0;

    res.status(200).json({
      days,
      totalCostUsd: totals[0]?.costUsd || 0,
      totalCalls: totals[0]?.calls || 0,
      cache: { hits, lookups: hits + misses, hitRate: hits + misses > 0 ? hits / (hits + misses) : 0 },
      byDay,
      byUser,
    });
  } catch (err) {
    next(err);
  }
};

// Read-only view of the security audit trail, newest first. Optional
// `?event=` filter (one of AUDIT_EVENTS) and the usual page/limit.
export const listAuditLog = async (req, res, next) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const filter = {};
    if (req.query.event) {
      if (!AUDIT_EVENTS.includes(req.query.event)) {
        res.status(400);
        throw new Error(`Unknown event. One of: ${AUDIT_EVENTS.join(", ")}`);
      }
      filter.event = req.query.event;
    }

    const [items, total] = await Promise.all([
      AuditLog.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).populate("user", "email username").lean(),
      AuditLog.countDocuments(filter),
    ]);

    res.status(200).json({ items, ...buildPageMeta(page, limit, total) });
  } catch (err) {
    next(err);
  }
};
