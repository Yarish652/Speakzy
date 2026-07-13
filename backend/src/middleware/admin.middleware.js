// Admin gating by email allowlist. ADMIN_EMAILS is a comma-separated env var
// (e.g. "me@example.com,other@example.com"), read per-request so tests and
// restarts pick up changes without caching.

export function isAdminEmail(email) {
  const admins = (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);

  const normalized = (email || "").toLowerCase();
  return Boolean(normalized) && admins.includes(normalized);
}

// The actual gate for admin routes. The frontend also receives an isAdmin
// flag (via /api/auth/me) to decide what UI to show — but that flag is
// cosmetic; this middleware is what protects the data.
export function requireAdmin(req, res, next) {
  if (!isAdminEmail(req.user?.email)) {
    return res.status(403).json({ message: "Admin access required" });
  }
  next();
}
