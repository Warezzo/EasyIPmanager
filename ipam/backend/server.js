require("dotenv").config();
const express = require("express");
const path = require("path");
const cors = require("cors");
const rateLimit = require("express-rate-limit");

const { version } = require("./package.json");
const authRoutes = require("./routes/auth");
const subnetRoutes = require("./routes/subnets");
const dnsRoutes = require("./routes/dns");
const scannerRoutes = require("./routes/scanner");
const sshRoutes = require("./routes/ssh");
const { attachSshWs } = require("./routes/sshWs");
const { closeDb } = require("./db");

// ── Env validation ─────────────────────────────────────────────────────────────
if (process.env.NODE_ENV === "production") {
  if (!process.env.JWT_SECRET) {
    console.error("FATAL: JWT_SECRET is required in production. Set it in your .env file.");
    process.exit(1);
  }
  if (!process.env.ADMIN_PASSWORD) {
    console.error("FATAL: ADMIN_PASSWORD is required in production. Set it in your .env file.");
    process.exit(1);
  }
  if (!process.env.SSH_ENCRYPTION_KEY) {
    console.error("FATAL: SSH_ENCRYPTION_KEY is required in production (must differ from JWT_SECRET).");
    process.exit(1);
  }
  if (process.env.SSH_ENCRYPTION_KEY === process.env.JWT_SECRET) {
    console.error("FATAL: SSH_ENCRYPTION_KEY must be different from JWT_SECRET (key separation).");
    process.exit(1);
  }
}

const app = express();
const PORT = process.env.PORT || 5050;

// ── Trust proxy (needed for correct rate-limit IP behind nginx/traefik) ──────
app.set("trust proxy", 1);

// ── Security headers ─────────────────────────────────────────────────────────
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-XSS-Protection", "0"); // modern browsers use CSP, not this
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  if (process.env.NODE_ENV === "production") {
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
  next();
});

// ── CORS — applied only to /api routes ────────────────────────────────────────
// Do NOT apply CORS globally: Vite builds scripts with crossorigin attribute,
// causing browsers to send Origin even for same-origin requests, which would
// block static file serving.

// All /api routes are protected by JWT — CORS here only needs to allow the
// Vite dev server (different port). In production the frontend is same-origin
// so the browser sends no Origin header for most requests.
// We don't restrict by origin because JWTs in localStorage are not vulnerable
// to CSRF (unlike cookies), so CORS doesn't add meaningful protection here.
const corsMiddleware = cors({ origin: true, credentials: true });

// ── Global rate limit on all API routes ───────────────────────────────────────
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min window
  max: 500,                  // generous for a lab tool
  message: { error: "Too many requests, please slow down" },
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply CORS and rate limiting only to /api — NOT to static file serving
app.use("/api", corsMiddleware, globalLimiter);

app.use(express.json({ limit: "1mb" }));

// ── API Routes ────────────────────────────────────────────────────────────────
app.use("/api/auth", authRoutes);
app.use("/api/subnets", subnetRoutes);
app.use("/api/dns", dnsRoutes);
app.use("/api/scanner", scannerRoutes);
app.use("/api/ssh", sshRoutes);

// ── Health check ──────────────────────────────────────────────────────────────
app.get("/api/health", (req, res) => res.json({ ok: true, version }));

// ── Serve React build ─────────────────────────────────────────────────────────
const STATIC_DIR = path.join(__dirname, "../frontend/dist");
app.use(express.static(STATIC_DIR));
app.get("*", (req, res) => res.sendFile(path.join(STATIC_DIR, "index.html")));

// ── Error handler ─────────────────────────────────────────────────────────────
app.use((err, req, res, _next) => {
  // Don't leak internal error details to clients
  const isCorsError = err.message === "Not allowed by CORS";
  const status = isCorsError ? 403 : (err.status || 500);
  const message = status < 500 ? err.message : "Internal server error";
  if (status >= 500) console.error(err);
  res.status(status).json({ error: message });
});

// ── Start ─────────────────────────────────────────────────────────────────────
const server = app.listen(PORT, "0.0.0.0", () => {
  console.log(`IPAM running on http://0.0.0.0:${PORT}`);
  console.log(`DB: ${process.env.DB_PATH || "local"}`);
  if (!process.env.JWT_SECRET) console.warn("WARNING: JWT_SECRET not set — using insecure default");
});

attachSshWs(server);

// ── Graceful shutdown ─────────────────────────────────────────────────────────
function shutdown(signal) {
  console.log(`${signal} received — shutting down gracefully`);
  server.close(() => {
    closeDb();
    process.exit(0);
  });
  // Force-exit after 5 s if connections don't drain
  setTimeout(() => process.exit(1), 5000).unref();
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
