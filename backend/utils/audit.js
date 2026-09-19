import crypto from "crypto";
import AuditLog from "../models/AuditLog.js";
import { logger } from "./logger.js";

export const AUDIT_EVENTS = [
  "register",
  "login",
  "demo_login",
  "login_failed",
  "account_locked",
  "logout",
  "refresh_reuse_detected",
  "password_changed",
  "password_reset_requested",
  "password_reset",
  "email_verified",
  "session_revoked",
  "api_key_saved",
  "api_key_removed",
];

// An email that isn't an account is still worth correlating across attempts (is
// one address being sprayed?), but not worth storing in the clear.
export const hashIdentifier = (value) => crypto.createHash("sha256").update(String(value).toLowerCase()).digest("hex").slice(0, 16);

/**
 * Best-effort: an audit write failing must never fail (or slow the failure of)
 * the request it describes. Awaited by callers only where ordering matters.
 */
export const recordAudit = async (req, event, { userId = null, meta } = {}) => {
  try {
    await AuditLog.create({
      user: userId,
      event,
      ip: req.ip || "",
      userAgent: (req.headers?.["user-agent"] || "").slice(0, 300),
      requestId: req.id || null,
      ...(meta ? { meta } : {}),
    });
  } catch (err) {
    logger.error({ err: err.message, event }, "Failed to write audit log entry");
  }
};
