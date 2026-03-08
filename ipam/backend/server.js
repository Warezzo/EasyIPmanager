require("dotenv").config();
const express = require("express");
const path = require("path");
const cors = require("cors");

const authRoutes = require("./routes/auth");
const subnetRoutes = require("./routes/subnets");
const dnsRoutes = require("./routes/dns");
const scannerRoutes = require("./routes/scanner");

const app = express();
const PORT = process.env.PORT || 5050;

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());

// ── API Routes ────────────────────────────────────────────────────────────────
app.use("/api/auth", authRoutes);
app.use("/api/subnets", subnetRoutes);
app.use("/api/dns", dnsRoutes);
app.use("/api/scanner", scannerRoutes);

// ── Health check ──────────────────────────────────────────────────────────────
app.get("/api/health", (req, res) => res.json({ ok: true, version: "1.0.0" }));

// ── Serve React build ─────────────────────────────────────────────────────────
const STATIC_DIR = path.join(__dirname, "../frontend/dist");
app.use(express.static(STATIC_DIR));
app.get("*", (req, res) => res.sendFile(path.join(STATIC_DIR, "index.html")));

// ── Error handler ─────────────────────────────────────────────────────────────
app.use((err, req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: err.message || "Internal server error" });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`IPAM running on http://0.0.0.0:${PORT}`);
  console.log(`DB: ${process.env.DB_PATH || "local"}`);
});
