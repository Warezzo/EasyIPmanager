const express = require("express");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const rateLimit = require("express-rate-limit");
const { signToken, requireAuth } = require("../middleware/auth");

const router = express.Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: "Too many login attempts, try again in 15 minutes" },
  standardHeaders: true,
  legacyHeaders: false,
});

// Pre-hash admin password once at startup so we never do plain-text comparison
const ADMIN_USER = process.env.ADMIN_USER || "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";
if (!ADMIN_PASSWORD) {
  console.warn("WARNING: ADMIN_PASSWORD is not set — login will accept an empty password");
}
const ADMIN_HASH = bcrypt.hashSync(ADMIN_PASSWORD, 10);

// POST /api/auth/login
router.post("/login", loginLimiter, async (req, res) => {
  const { username, password } = req.body || {};

  if (!username || !password) {
    return res.status(400).json({ error: "Username and password required" });
  }

  // Constant-time username comparison to prevent timing attacks
  let userMatch = false;
  try {
    const userBuf = Buffer.from(username);
    const adminBuf = Buffer.from(ADMIN_USER);
    userMatch =
      userBuf.length === adminBuf.length &&
      crypto.timingSafeEqual(userBuf, adminBuf);
  } catch {
    userMatch = false;
  }

  // bcrypt.compare is inherently constant-time
  const passMatch = await bcrypt.compare(password, ADMIN_HASH).catch(() => false);

  if (!userMatch || !passMatch) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  const token = signToken(ADMIN_USER);
  res.json({ token, user: ADMIN_USER });
});

// GET /api/auth/me
router.get("/me", requireAuth, (req, res) => {
  res.json({ user: req.user.user });
});

module.exports = router;
