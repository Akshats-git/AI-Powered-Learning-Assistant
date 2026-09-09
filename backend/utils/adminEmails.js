// Admin access is driven entirely by an env var allowlist rather than a
// stored `isAdmin` flag — one fewer mutable, security-relevant field on the
// User schema, and promoting/demoting an admin is just a config change.
// Parsed fresh on every call (it's a short comma list) rather than cached at
// module load, so a changed env var takes effect without a restart.
export const isAdminEmail = (email) => {
  const admins = (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);

  return admins.includes((email || "").toLowerCase());
};
