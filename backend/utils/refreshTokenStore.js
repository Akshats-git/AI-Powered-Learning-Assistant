import crypto from "crypto";
import RefreshToken from "../models/RefreshToken.js";
import { parseDurationMs } from "./parseDuration.js";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

const expiryDate = () => new Date(Date.now() + parseDurationMs(process.env.JWT_REFRESH_EXPIRES_IN, SEVEN_DAYS_MS));

/** Starts a brand-new rotation family — one per login/register, ever. */
export const startRefreshFamily = async (userId, meta = {}) => {
  const jti = crypto.randomUUID();
  const familyId = crypto.randomUUID();
  await RefreshToken.create({
    jti,
    user: userId,
    familyId,
    expiresAt: expiryDate(),
    userAgent: meta.userAgent || "",
    ip: meta.ip || "",
  });
  return { jti, familyId };
};

/**
 * Rotates one refresh token: marks it used and issues the next token in the
 * same family.
 *
 * @returns `{ ok: true, jti, familyId }` on a clean rotation, or
 *   `{ ok: false, reason }` — `"reused"` means this exact token was already
 *   rotated away once before (a stolen token replayed after the legitimate
 *   client moved on, most likely), and revokes every token in its family as
 *   a side effect; `"not-found"` / `"revoked"` / `"expired"` just reject the
 *   request. The caller decides what each means for the response.
 */
export const rotateRefreshToken = async (presentedJti, userId) => {
  const existing = presentedJti ? await RefreshToken.findOne({ jti: presentedJti }) : null;
  if (!existing || String(existing.user) !== String(userId)) return { ok: false, reason: "not-found" };
  if (existing.revokedAt) return { ok: false, reason: "revoked" };
  if (existing.expiresAt < new Date()) return { ok: false, reason: "expired" };

  if (existing.usedAt) {
    await revokeFamily(existing.familyId);
    return { ok: false, reason: "reused" };
  }

  const nextJti = crypto.randomUUID();
  await RefreshToken.create({
    jti: nextJti,
    user: userId,
    familyId: existing.familyId,
    expiresAt: expiryDate(),
    // Carried forward rather than re-captured — this is what lets the
    // sessions list show "Chrome on macOS" for a session that's since
    // rotated past its original token.
    userAgent: existing.userAgent,
    ip: existing.ip,
  });
  await RefreshToken.updateOne({ _id: existing._id }, { $set: { usedAt: new Date() } });

  return { ok: true, jti: nextJti, familyId: existing.familyId };
};

/** Revokes every not-already-revoked token in a family — logout, or a future "log out everywhere." */
export const revokeFamily = (familyId) => RefreshToken.updateMany({ familyId, revokedAt: null }, { $set: { revokedAt: new Date() } });

/** Revokes every not-already-revoked token for a user, across every family — a password reset should end every existing session, not just the request that triggered it. */
export const revokeAllForUser = (userId) => RefreshToken.updateMany({ user: userId, revokedAt: null }, { $set: { revokedAt: new Date() } });

/**
 * Lists a user's active sessions — one row per family that still has a
 * live (not used, not revoked, not expired) token, which is exactly the
 * token a future refresh would rotate away next.
 */
export const listActiveSessions = (userId) =>
  RefreshToken.find({ user: userId, usedAt: null, revokedAt: null, expiresAt: { $gt: new Date() } })
    .sort({ createdAt: -1 })
    .lean();

/**
 * Revokes one session (family) — but only if it belongs to `userId`, so a
 * caller can't end another user's session by guessing/reusing a familyId.
 * @returns true if a session was found and revoked, false otherwise.
 */
export const revokeOwnedSession = async (familyId, userId) => {
  const owned = await RefreshToken.exists({ familyId, user: userId });
  if (!owned) return false;

  await revokeFamily(familyId);
  return true;
};
