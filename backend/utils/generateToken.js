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

export const generateRefreshToken = (id) => {
  return jwt.sign({ id, type: "refresh" }, process.env.REFRESH_TOKEN_SECRET || process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || "7d",
  });
};

export const verifyRefreshToken = (token) => {
  return jwt.verify(token, process.env.REFRESH_TOKEN_SECRET || process.env.JWT_SECRET);
};
