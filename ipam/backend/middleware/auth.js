const jwt = require("jsonwebtoken");

const SECRET = process.env.JWT_SECRET;

if (!SECRET) {
  if (process.env.NODE_ENV === "production") {
    console.error("FATAL: JWT_SECRET environment variable is required in production. Exiting.");
    process.exit(1);
  }
  console.warn("WARNING: JWT_SECRET not set — using insecure default (development only, NEVER use in production)");
}

const EFFECTIVE_SECRET = SECRET || "dev_secret_UNSAFE_do_not_use_in_production";

function signToken(user) {
  return jwt.sign({ user }, EFFECTIVE_SECRET, { expiresIn: "12h" });
}

function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Unauthorized" });
  try {
    req.user = jwt.verify(token, EFFECTIVE_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

module.exports = { signToken, requireAuth };
