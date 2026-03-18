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
if (!process.env.JWT_SECRET && process.env.NODE_ENV === "production") {
  console.error("FATAL: JWT_SECRET is required in production. Set it in your .env file.");
  process.exit(1);
}
if (!process.env.ADMIN_PASSWORD && process.env.NODE_ENV === "production") {
  console.error("FATAL: ADMIN_PASSWORD is required in production. Set it in your .env file.");
  process.exit(1);
}

const app = express();
const PORT = process.env.PORT || 5050;

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
