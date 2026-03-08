const express = require("express");
const { randomUUID } = require("crypto");
const { spawn } = require("child_process");
const { getDb } = require("../db");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);

// Active scans map: scanId -> { process, aborted }
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
router.post("/start", (req, res) => {
  const { subnet_id, target, scan_type = "ping" } = req.body;
  // target can be a CIDR, single IP, or range
  if (!target) return res.status(400).json({ error: "target required (CIDR or IP)" });

  // Validate target is a reasonable network string (no shell injection)
  if (!/^[\d./\-]+$/.test(target)) {
    return res.status(400).json({ error: "Invalid target format" });
  }

  const db = getDb();
  const id = randomUUID();
  db.prepare(`INSERT INTO scan_results (id,subnet_id,target,status,started_at) VALUES (?,?,?,?,?)`)
    .run(id, subnet_id || null, target, "running", new Date().toISOString());

  // Build nmap command based on scan_type
  // ping: fast host discovery only
  // ports: ping + common ports
  // full: OS detection + services (slower)
  const nmapArgs = buildNmapArgs(target, scan_type);

  const proc = spawn("nmap", nmapArgs, { timeout: 5 * 60 * 1000 });
  activeScans.set(id, { process: proc, aborted: false });

  let stdout = "";
  let stderr = "";
  proc.stdout.on("data", (d) => { stdout += d.toString(); });
  proc.stderr.on("data", (d) => { stderr += d.toString(); });

  proc.on("close", (code) => {
    activeScans.delete(id);
    const db2 = getDb();
    try {
      const parsed = parseNmapOutput(stdout);
      db2.prepare(`UPDATE scan_results SET status=?,finished_at=?,result=? WHERE id=?`)
        .run(code === 0 ? "done" : "error", new Date().toISOString(), JSON.stringify({ hosts: parsed, raw: stdout, stderr }), id);
    } catch (e) {
      db2.prepare(`UPDATE scan_results SET status='error',finished_at=?,result=? WHERE id=?`)
        .run(new Date().toISOString(), JSON.stringify({ error: e.message, raw: stdout, stderr }), id);
    }
  });

  res.status(202).json({ id, status: "running", target });
});

// POST /api/scanner/:id/abort
router.post("/:id/abort", (req, res) => {
  const entry = activeScans.get(req.params.id);
  if (!entry) return res.status(404).json({ error: "Scan not found or already finished" });
  entry.process.kill("SIGTERM");
  entry.aborted = true;
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

function buildNmapArgs(target, scan_type) {
  const base = ["-oN", "-"]; // output to stdout
  switch (scan_type) {
    case "ports":
      return ["-sV", "--top-ports", "100", "-T4", target, ...base];
    case "full":
      return ["-sV", "-O", "--top-ports", "1000", "-T4", target, ...base];
    case "ping":
    default:
      return ["-sn", "-T4", target, ...base];
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
      const full = reportMatch[1];
      const ipMatch = full.match(/\(?([\d.]+)\)?/);
      const hostnameMatch = full.match(/^([^\s(]+)/);
      current = {
        ip: ipMatch ? ipMatch[1] : full,
        hostname: hostnameMatch && hostnameMatch[1] !== ipMatch?.[1] ? hostnameMatch[1] : null,
        mac: null,
        vendor: null,
        status: "up",
        ports: [],
        os: null,
      };
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
  return { ...scan, result: scan.result ? JSON.parse(scan.result) : null };
}

module.exports = router;
