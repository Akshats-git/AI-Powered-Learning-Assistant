import jwt from "jsonwebtoken";

// Two token types on purpose: a short-lived access token that goes in the
// Authorization header (so a stolen one is only useful for minutes, not the
// old 7 days), and a longer-lived refresh token that never touches
// JavaScript-readable storage — it's only ever set/read as an httpOnly
// cookie, so an XSS payload can read the access token but not mint new ones.
export const generateAccessToken = (id) => {
  return jwt.sign({ id, type: "access" }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_ACCESS_EXPIRES_IN || "15m",
  });
};

// jti/familyId are what let a refresh token's use be tracked server-side
// (utils/refreshTokenStore.js) — a signature alone can prove a token is
// genuine, but not whether *this specific token* has already been rotated
// away and is now being replayed. Always supplied by the caller (never
// generated here) so the JWT's claims and the server-side RefreshToken row
// they're checked against can never drift apart.
export const generateRefreshToken = (id, jti, familyId) => {
  return jwt.sign({ id, type: "refresh", jti, familyId }, process.env.REFRESH_TOKEN_SECRET || process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || "7d",
  });
};

export const verifyRefreshToken = (token) => {
  return jwt.verify(token, process.env.REFRESH_TOKEN_SECRET || process.env.JWT_SECRET);
};
