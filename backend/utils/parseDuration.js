const UNIT_MS = { s: 1000, m: 60 * 1000, h: 60 * 60 * 1000, d: 24 * 60 * 60 * 1000 };

// Parses the small subset of jsonwebtoken's `expiresIn` shorthand ("15m",
// "7d", "1h") into milliseconds, so a single env var like
// JWT_REFRESH_EXPIRES_IN can drive both the token's own expiry and the
// cookie's maxAge instead of the two silently drifting apart.
export const parseDurationMs = (value, fallbackMs) => {
  const match = /^(\d+)([smhd])$/.exec(String(value || "").trim());
  if (!match) return fallbackMs;
  const [, amount, unit] = match;
  return Number(amount) * UNIT_MS[unit];
};
