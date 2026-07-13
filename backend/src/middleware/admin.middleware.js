// Gates admin-only routes by email allowlist. ADMIN_EMAILS is a
// comma-separated env var (e.g. "me@example.com,other@example.com").
// Read per-request so tests and restarts pick up changes without caching.
export function requireAdmin(req, res, next) {
  const admins = (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);

  const userEmail = (req.user?.email || "").toLowerCase();
  if (!userEmail || !admins.includes(userEmail)) {
    return res.status(403).json({ message: "Admin access required" });
  }

  next();
}
