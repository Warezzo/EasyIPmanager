/**
 * Centralized security configuration.
 * All secrets are validated here — no hardcoded fallbacks scattered across files.
 */

const isProd = process.env.NODE_ENV === "production";

// ── JWT Secret ──────────────────────────────────────────────────────────────
const JWT_SECRET = (() => {
  const s = process.env.JWT_SECRET;
  if (!s && isProd) {
    console.error("FATAL: JWT_SECRET environment variable is required in production. Exiting.");
    process.exit(1);
  }
  if (!s) {
    console.warn("[SECURITY] JWT_SECRET not set — using insecure default (dev only)");
  }
  return s || "dev_secret_UNSAFE_do_not_use_in_production";
})();

// ── SSH Encryption Key — MUST be separate from JWT ──────────────────────────
const SSH_ENCRYPTION_KEY = (() => {
  const s = process.env.SSH_ENCRYPTION_KEY;
  if (!s && isProd) {
    console.error("FATAL: SSH_ENCRYPTION_KEY environment variable is required in production. Exiting.");
    process.exit(1);
  }
  if (!s) {
    console.warn("[SECURITY] SSH_ENCRYPTION_KEY not set — using insecure default (dev only)");
  }
  return s || "dev_ssh_encryption_UNSAFE_do_not_use_in_production";
})();

module.exports = { JWT_SECRET, SSH_ENCRYPTION_KEY };
