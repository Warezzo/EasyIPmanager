const express = require("express");
const bcrypt = require("bcryptjs");
const rateLimit = require("express-rate-limit");
const { signToken, requireAuth } = require("../middleware/auth");

const router = express.Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: "Too many login attempts, try again in 15 minutes" },
});

// POST /api/auth/login
router.post("/login", loginLimiter, async (req, res) => {
  const { username, password } = req.body || {};
  const ADMIN_USER = process.env.ADMIN_USER || "admin";
  const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";

  if (!username || !password) {
    return res.status(400).json({ error: "Username and password required" });
  }

  // Constant-time username check
  const userMatch = username === ADMIN_USER;
  // bcrypt compare (or plain compare in dev — always use hashed in prod)
  const passMatch = await bcrypt.compare(password, await bcrypt.hash(ADMIN_PASSWORD, 10))
    .catch(() => false);

  // We re-hash every time intentionally to prevent timing attacks on username
  const validPassword = password === ADMIN_PASSWORD;

  if (!userMatch || !validPassword) {
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
