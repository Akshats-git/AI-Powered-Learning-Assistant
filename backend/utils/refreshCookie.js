import { parseDurationMs } from "./parseDuration.js";
import { resolveSameSite, resolveSecure } from "./cookieConfig.js";

const REFRESH_COOKIE_NAME = "refreshToken";
const REFRESH_COOKIE_PATH = "/api/auth";
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

const cookieOptions = () => {
  const sameSite = resolveSameSite();
  return {
    httpOnly: true,
    secure: resolveSecure(sameSite),
    sameSite,
    path: REFRESH_COOKIE_PATH,
  };
};

export const setRefreshCookie = (res, token) => {
  res.cookie(REFRESH_COOKIE_NAME, token, {
    ...cookieOptions(),
    maxAge: parseDurationMs(process.env.JWT_REFRESH_EXPIRES_IN, SEVEN_DAYS_MS),
  });
};

export const clearRefreshCookie = (res) => {
  res.clearCookie(REFRESH_COOKIE_NAME, cookieOptions());
};

export const readRefreshCookie = (req) => req.cookies?.[REFRESH_COOKIE_NAME];
