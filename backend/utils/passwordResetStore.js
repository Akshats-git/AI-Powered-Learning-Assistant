import crypto from "crypto";
import PasswordResetToken from "../models/PasswordResetToken.js";

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

// Only the hash is ever persisted — the raw token is what goes in the email
// link, so a database read (backup, injection, whatever) can't be turned
// into working reset links.
const hashToken = (token) => crypto.createHash("sha256").update(token).digest("hex");

/** Issues a fresh single-use reset token for a user and returns the raw (unhashed) value to email out. */
export const createResetToken = async (userId) => {
  const token = crypto.randomBytes(32).toString("hex");
  await PasswordResetToken.create({
    tokenHash: hashToken(token),
    user: userId,
    expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
  });
  return token;
};

/**
 * Redeems a raw reset token: valid only once, only before it expires.
 * @returns the user id it was issued for, or `null` if it's invalid/used/expired.
 */
export const consumeResetToken = async (token) => {
  const record = await PasswordResetToken.findOne({ tokenHash: hashToken(token) });
  if (!record || record.usedAt || record.expiresAt < new Date()) return null;

  record.usedAt = new Date();
  await record.save();
  return record.user;
};
