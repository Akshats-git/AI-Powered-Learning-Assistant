import crypto from "crypto";
import EmailVerificationToken from "../models/EmailVerificationToken.js";

const VERIFICATION_TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

const hashToken = (token) => crypto.createHash("sha256").update(token).digest("hex");

/** Issues a fresh single-use verification token for a user and returns the raw (unhashed) value to email out. */
export const createVerificationToken = async (userId) => {
  const token = crypto.randomBytes(32).toString("hex");
  await EmailVerificationToken.create({
    tokenHash: hashToken(token),
    user: userId,
    expiresAt: new Date(Date.now() + VERIFICATION_TOKEN_TTL_MS),
  });
  return token;
};

/**
 * Redeems a raw verification token: valid only once, only before it expires.
 * @returns the user id it was issued for, or `null` if it's invalid/used/expired.
 */
export const consumeVerificationToken = async (token) => {
  // One atomic check-and-mark: with a separate find then save, two concurrent
  // requests could both see the token as unused and both redeem it.
  const now = new Date();
  const record = await EmailVerificationToken.findOneAndUpdate(
    { tokenHash: hashToken(token), usedAt: null, expiresAt: { $gt: now } },
    { $set: { usedAt: now } }
  );
  return record ? record.user : null;
};
