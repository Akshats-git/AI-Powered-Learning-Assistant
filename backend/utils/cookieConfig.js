// Shared by refreshCookie.js and csrf.js — both cookies need to travel
// together (the CSRF check compares one against the other) so they must
// agree on SameSite/Secure.
//
// Default "lax" is right for same-origin deploys, including frontend and
// backend as subdomains of the same registrable domain (e.g.
// app.example.com talking to api.example.com — the browser still treats
// that as "same-site"). A deploy where frontend and backend sit on
// genuinely different registrable domains (a Vercel default *.vercel.app
// frontend calling a Render *.onrender.com backend, the common free-tier
// setup) needs COOKIE_SAME_SITE=none — otherwise the browser silently drops
// these cookies on every cross-site fetch/XHR (Lax only rides along on
// top-level navigations), and the refresh flow breaks the moment the access
// token expires.
const VALID_SAME_SITE = ["lax", "strict", "none"];

export const resolveSameSite = () => {
  const configured = (process.env.COOKIE_SAME_SITE || "lax").toLowerCase();
  return VALID_SAME_SITE.includes(configured) ? configured : "lax";
};

// SameSite=None is rejected by browsers unless Secure is also set, so a
// cross-site deploy needs Secure regardless of NODE_ENV.
export const resolveSecure = (sameSite) => process.env.NODE_ENV === "production" || sameSite === "none";
