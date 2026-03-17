const express = require("express");
const { randomUUID } = require("crypto");
const { spawn } = require("child_process");
const { getDb } = require("../db");
const { requireAuth } = require("../middleware/auth");
const rateLimit = require("express-rate-limit");

const scanStartLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { error: "Too many scan requests — max 10 per minute" },
  standardHeaders: true,
  legacyHeaders: false,
});

const router = express.Router();
router.use(requireAuth);

// Active scans map: scanId -> { process, killTimer }
const activeScans = new Map();

// GET /api/scanner - list recent scans
router.get("/", (req, res) => {
  const db = getDb();
  const scans = db.prepare(`
    SELECT sr.*, s.name as subnet_name, s.cidr
    FROM scan_results sr
    LEFT JOIN subnets s ON s.id = sr.subnet_id
    ORDER BY sr.created_at DESC LIMIT 50
  `).all();
  res.json(scans.map(parseScan));
});

// GET /api/scanner/:id - get scan status + result
router.get("/:id", (req, res) => {
  const db = getDb();
  const scan = db.prepare("SELECT * FROM scan_results WHERE id=?").get(req.params.id);
  if (!scan) return res.status(404).json({ error: "Not found" });
  res.json(parseScan(scan));
});

// POST /api/scanner/start - kick off a scan
router.post("/start", scanStartLimiter, (req, res) => {
  const { subnet_id, target, scan_type = "ping" } = req.body;

  if (!target) return res.status(400).json({ error: "target required (CIDR or IP)" });

  // Strict validation: only allow well-formed IPs, CIDRs, or simple ranges
  if (!isValidTarget(target)) {
    return res.status(400).json({ error: "Invalid target format. Accepted: single IP (1.2.3.4), CIDR (1.2.3.0/24), range (1.2.3.1-254)" });
  }

  if (scan_type && !["ping", "ports", "full"].includes(scan_type)) {
    return res.status(400).json({ error: "Invalid scan_type. Must be ping, ports, or full" });
  }

  const db = getDb();
  const id = randomUUID();
  db.prepare(`INSERT INTO scan_results (id,subnet_id,target,status,started_at) VALUES (?,?,?,?,?)`)
    .run(id, subnet_id || null, target, "running", new Date().toISOString());

  const nmapArgs = buildNmapArgs(target, scan_type);
  const proc = spawn("nmap", nmapArgs);

  // Hard timeout: kill nmap after 10 minutes regardless
  const killTimer = setTimeout(() => {
    if (activeScans.has(id)) {
      proc.kill("SIGKILL");
    }
  }, 10 * 60 * 1000);

  activeScans.set(id, { process: proc, killTimer });

  const MAX_BUF = 10 * 1024 * 1024; // 10 MB cap — prevents memory exhaustion on huge scans
  let stdout = "";
  let stderr = "";
  let bufOverflow = false;
  proc.stdout.on("data", (d) => {
    if (stdout.length < MAX_BUF) stdout += d.toString();
    else bufOverflow = true;
  });
  proc.stderr.on("data", (d) => {
    if (stderr.length < MAX_BUF) stderr += d.toString();
  });

  proc.on("error", (err) => {
    clearTimeout(killTimer);
    activeScans.delete(id);
    const errMsg = err.code === "ENOENT" ? "nmap not found — install nmap on the server" : err.message;
    console.error("nmap spawn error:", err);
    getDb().prepare("UPDATE scan_results SET status='error',finished_at=?,result=? WHERE id=?")
      .run(new Date().toISOString(), JSON.stringify({ error: errMsg }), id);
  });

  proc.on("close", (code) => {
    const entry = activeScans.get(id);
    if (entry) {
      clearTimeout(entry.killTimer);
      activeScans.delete(id);
    }
    const db2 = getDb();
    try {
      const parsed = parseNmapOutput(stdout);
      // Keep at most 64 KB of raw output in the DB — enough for debugging,
      // prevents scan_results from bloating SQLite with multi-MB nmap logs
      const MAX_RAW_DB = 64 * 1024;
      const rawDb = stdout.length > MAX_RAW_DB
        ? stdout.slice(0, MAX_RAW_DB) + "\n…[output troncato — mostra solo i primi 64 KB]"
        : stdout;
      const result = { hosts: parsed, raw: rawDb, stderr: stderr.slice(0, 4096) };
      if (bufOverflow) result.warning = "Output truncated at 10 MB — scan too large";
      db2.prepare("UPDATE scan_results SET status=?,finished_at=?,result=? WHERE id=?")
        .run(code === 0 ? "done" : "error", new Date().toISOString(), JSON.stringify(result), id);
    } catch (e) {
      db2.prepare("UPDATE scan_results SET status='error',finished_at=?,result=? WHERE id=?")
        .run(new Date().toISOString(), JSON.stringify({ error: e.message, raw: stdout, stderr }), id);
    }
  });

  res.status(202).json({ id, status: "running", target });
});

// DELETE /api/scanner/:id - delete a scan record
router.delete("/:id", (req, res) => {
  const db = getDb();
  const scan = db.prepare("SELECT id, status FROM scan_results WHERE id=?").get(req.params.id);
  if (!scan) return res.status(404).json({ error: "Scansione non trovata" });
  if (scan.status === "running") return res.status(409).json({ error: "Impossibile eliminare una scansione in corso. Interrompila prima." });
  db.prepare("DELETE FROM scan_results WHERE id=?").run(req.params.id);
  res.status(204).end();
});

// POST /api/scanner/:id/abort
router.post("/:id/abort", (req, res) => {
  const entry = activeScans.get(req.params.id);
  if (!entry) return res.status(404).json({ error: "Scan not found or already finished" });
  clearTimeout(entry.killTimer);
  entry.process.kill("SIGTERM");
  activeScans.delete(req.params.id);
  const db = getDb();
  db.prepare("UPDATE scan_results SET status='aborted',finished_at=? WHERE id=?")
    .run(new Date().toISOString(), req.params.id);
  res.json({ ok: true });
});

// POST /api/scanner/:id/import - import discovered hosts into IPAM
router.post("/:id/import", (req, res) => {
  const { subnet_id, hosts } = req.body;
  if (!subnet_id || !hosts?.length) return res.status(400).json({ error: "subnet_id and hosts required" });
  const db = getDb();
  const subnet = db.prepare("SELECT * FROM subnets WHERE id=?").get(subnet_id);
  if (!subnet) return res.status(404).json({ error: "Subnet not found" });

  let imported = 0, skipped = 0;
  const insert = db.prepare(`INSERT OR IGNORE INTO ip_entries (id,subnet_id,ip,hostname,mac,type,description,tags) VALUES (?,?,?,?,?,?,?,?)`);
  const insertMany = db.transaction((hosts) => {
    for (const h of hosts) {
      const r = insert.run(randomUUID(), subnet_id, h.ip, h.hostname || h.ip, h.mac || null, "other", `Discovered by scan`, JSON.stringify(["scanned"]));
      if (r.changes > 0) imported++; else skipped++;
    }
  });
  insertMany(hosts);
  res.json({ imported, skipped });
});

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Validate that a scan target is a legitimate IP, CIDR, or simple range.
 * Rejects anything that could be used for command injection.
 */
function isValidTarget(target) {
  const ipRe    = /^(\d{1,3}\.){3}\d{1,3}$/;
  const cidrRe  = /^(\d{1,3}\.){3}\d{1,3}\/(\d|[12]\d|3[012])$/;
  const rangeRe = /^(\d{1,3}\.){3}\d{1,3}-\d{1,3}$/;

  if (!ipRe.test(target) && !cidrRe.test(target) && !rangeRe.test(target)) return false;

  // Validate each octet of the base IP is 0-255
  const baseIP = target.split(/[\/\-]/)[0];
  return baseIP.split(".").every((o) => {
    const n = parseInt(o, 10);
    return !isNaN(n) && n >= 0 && n <= 255;
  });
}

function buildNmapArgs(target, scan_type) {
  const base = ["-oN", "-"]; // output to stdout in normal format
  switch (scan_type) {
    case "ports":
      return ["-sV", "--top-ports", "100", "-T4", "--host-timeout", "5m", target, ...base];
    case "full":
      return ["-sV", "-O", "--top-ports", "1000", "-T4", "--host-timeout", "8m", target, ...base];
    case "ping":
    default:
      return ["-sn", "-T4", "--host-timeout", "2m", target, ...base];
  }
}

function parseNmapOutput(raw) {
  const hosts = [];
  const lines = raw.split("\n");
  let current = null;

  for (const line of lines) {
    const reportMatch = line.match(/Nmap scan report for (.+)/);
    if (reportMatch) {
      if (current) hosts.push(current);
      const full = reportMatch[1].trim();
      const ipMatch = full.match(/\(?([\d.]+)\)?$/);
      const hostnameMatch = full.match(/^([^\s(]+)/);
      const ip = ipMatch ? ipMatch[1] : full;
      const hostname = hostnameMatch && hostnameMatch[1] !== ip ? hostnameMatch[1] : null;
      current = { ip, hostname, mac: null, vendor: null, status: "up", ports: [], os: null };
      continue;
    }
    if (!current) continue;
    const macMatch = line.match(/MAC Address: ([\w:]+)\s*(?:\((.+)\))?/);
    if (macMatch) { current.mac = macMatch[1]; current.vendor = macMatch[2] || null; }
    const portMatch = line.match(/^(\d+)\/(tcp|udp)\s+(\w+)\s+(.*)/);
    if (portMatch) current.ports.push({ port: parseInt(portMatch[1]), proto: portMatch[2], state: portMatch[3], service: portMatch[4].trim() });
    const osMatch = line.match(/OS details: (.+)/);
    if (osMatch) current.os = osMatch[1];
  }
  if (current) hosts.push(current);
  return hosts;
}

function parseScan(scan) {
  let result = null;
  if (scan.result) {
    try { result = JSON.parse(scan.result); } catch { result = { error: "Result parsing failed" }; }
  }
  return { ...scan, result };
}

module.exports = router;
