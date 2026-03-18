const jwt = require("jsonwebtoken");
const { JWT_SECRET } = require("../lib/config");

function signToken(user) {
  return jwt.sign({ user }, JWT_SECRET, { algorithm: "HS256", expiresIn: "4h" });
}

function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Unauthorized" });
  try {
    req.user = jwt.verify(token, JWT_SECRET, { algorithms: ["HS256"] });
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

module.exports = { signToken, requireAuth };
