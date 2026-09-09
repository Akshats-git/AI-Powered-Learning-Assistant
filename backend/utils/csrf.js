import crypto from "crypto";

const CSRF_COOKIE_NAME = "csrfToken";
const CSRF_HEADER_NAME = "x-csrf-token";
const CSRF_COOKIE_PATH = "/api/auth";

const cookieOptions = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
  path: CSRF_COOKIE_PATH,
});

// Double-submit CSRF defense, adapted so it still works when the frontend
// lives on a different domain than the API (the deployed target — Vercel +
// Fly/Railway — so it can't rely on reading this cookie itself via
// document.cookie the way a same-domain app could): the server sets this as
// an httpOnly cookie *and* hands the same raw value back in the response
// body of register/login/refresh. The frontend stores that value and echoes
// it as a header on /refresh. A cross-site attacker's page makes the
// browser attach the cookie automatically, but has no way to read the value
// it would also need to put in the header — CORS keeps it from reading the
// login/refresh response body cross-origin.
export const issueCsrfToken = (res) => {
  const token = crypto.randomBytes(32).toString("hex");
  res.cookie(CSRF_COOKIE_NAME, token, cookieOptions());
  return token;
};

export const clearCsrfCookie = (res) => {
  res.clearCookie(CSRF_COOKIE_NAME, cookieOptions());
};

export const isCsrfTokenValid = (req) => {
  const cookieToken = req.cookies?.[CSRF_COOKIE_NAME];
  const headerToken = req.headers[CSRF_HEADER_NAME];
  return Boolean(cookieToken) && cookieToken === headerToken;
};
