const express = require("express");
const { randomUUID } = require("crypto");
const { getDb } = require("../db");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);

// ── Validation helpers ────────────────────────────────────────────────────────

function isValidCIDR(cidr) {
  const m = cidr && cidr.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\/(\d{1,2})$/);
  if (!m) return false;
  const octets = [m[1], m[2], m[3], m[4]].map(Number);
  const prefix = Number(m[5]);
  return octets.every((n) => n >= 0 && n <= 255) && prefix >= 1 && prefix <= 32;
}

function isValidIP(ip) {
  const m = ip && ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return false;
  return [m[1], m[2], m[3], m[4]].every((o) => { const n = Number(o); return n >= 0 && n <= 255; });
}

const VALID_ENTRY_TYPES = ["server", "router", "switch", "workstation", "printer", "camera", "iot", "other"];

// ── Subnets ──────────────────────────────────────────────────────────────────

router.get("/", (req, res) => {
  const db = getDb();
  const subnets = db.prepare("SELECT * FROM subnets ORDER BY name ASC").all();
  res.json(subnets);
});

router.post("/", (req, res) => {
  const { name, cidr, vlan, location, description } = req.body;
  if (!name || !cidr) return res.status(400).json({ error: "name and cidr required" });
  if (!isValidCIDR(cidr)) return res.status(400).json({ error: "Invalid CIDR format (e.g. 192.168.1.0/24)" });
  const db = getDb();
  const id = randomUUID();
  try {
    db.prepare(`INSERT INTO subnets (id,name,cidr,vlan,location,description) VALUES (?,?,?,?,?,?)`)
      .run(id, name, cidr, vlan || null, location || null, description || null);
    res.status(201).json(db.prepare("SELECT * FROM subnets WHERE id=?").get(id));
  } catch (e) {
    if (e.code === "SQLITE_CONSTRAINT_UNIQUE") return res.status(409).json({ error: "CIDR already exists" });
    throw e;
  }
});

router.put("/:id", (req, res) => {
  const { name, cidr, vlan, location, description } = req.body;
  if (cidr !== undefined && !isValidCIDR(cidr)) return res.status(400).json({ error: "Invalid CIDR format (e.g. 192.168.1.0/24)" });
  const db = getDb();
  const existing = db.prepare("SELECT * FROM subnets WHERE id=?").get(req.params.id);
  if (!existing) return res.status(404).json({ error: "Not found" });
  try {
    db.prepare(`UPDATE subnets SET name=?,cidr=?,vlan=?,location=?,description=? WHERE id=?`)
      .run(name ?? existing.name, cidr ?? existing.cidr, vlan ?? existing.vlan,
        location ?? existing.location, description ?? existing.description, req.params.id);
    res.json(db.prepare("SELECT * FROM subnets WHERE id=?").get(req.params.id));
  } catch (e) {
    if (e.code === "SQLITE_CONSTRAINT_UNIQUE") return res.status(409).json({ error: "CIDR already exists" });
    throw e;
  }
});

router.delete("/:id", (req, res) => {
  const db = getDb();
  const r = db.prepare("DELETE FROM subnets WHERE id=?").run(req.params.id);
  if (r.changes === 0) return res.status(404).json({ error: "Not found" });
  res.status(204).end();
});

// ── IP Entries ────────────────────────────────────────────────────────────────

router.get("/:id/entries", (req, res) => {
  const db = getDb();
  const entries = db.prepare("SELECT * FROM ip_entries WHERE subnet_id=? ORDER BY ip ASC").all(req.params.id);
  res.json(entries.map(parseEntry));
});

router.post("/:id/entries", (req, res) => {
  const { ip, hostname, mac, type, description, tags } = req.body;
  if (!ip || !hostname) return res.status(400).json({ error: "ip and hostname required" });
  if (!isValidIP(ip)) return res.status(400).json({ error: "Invalid IP address format" });
  if (type && !VALID_ENTRY_TYPES.includes(type)) return res.status(400).json({ error: `Invalid type. Must be one of: ${VALID_ENTRY_TYPES.join(", ")}` });
  const db = getDb();
  const id = randomUUID();
  try {
    db.prepare(`INSERT INTO ip_entries (id,subnet_id,ip,hostname,mac,type,description,tags) VALUES (?,?,?,?,?,?,?,?)`)
      .run(id, req.params.id, ip, hostname, mac || null, type || "other", description || null, JSON.stringify(tags || []));
    res.status(201).json(parseEntry(db.prepare("SELECT * FROM ip_entries WHERE id=?").get(id)));
  } catch (e) {
    if (e.code === "SQLITE_CONSTRAINT_UNIQUE") return res.status(409).json({ error: "IP already assigned in this subnet" });
    throw e;
  }
});

router.put("/:subnetId/entries/:id", (req, res) => {
  const { hostname, mac, type, description, tags } = req.body;
  const db = getDb();
  const existing = db.prepare("SELECT * FROM ip_entries WHERE id=? AND subnet_id=?").get(req.params.id, req.params.subnetId);
  if (!existing) return res.status(404).json({ error: "Not found" });
  db.prepare(`UPDATE ip_entries SET hostname=?,mac=?,type=?,description=?,tags=? WHERE id=?`)
    .run(hostname ?? existing.hostname, mac ?? existing.mac, type ?? existing.type,
      description ?? existing.description, JSON.stringify(tags ?? JSON.parse(existing.tags)), req.params.id);
  res.json(parseEntry(db.prepare("SELECT * FROM ip_entries WHERE id=?").get(req.params.id)));
});

router.delete("/:subnetId/entries/:id", (req, res) => {
  const db = getDb();
  const r = db.prepare("DELETE FROM ip_entries WHERE id=? AND subnet_id=?").run(req.params.id, req.params.subnetId);
  if (r.changes === 0) return res.status(404).json({ error: "Not found" });
  res.status(204).end();
});

function parseEntry(e) {
  let tags = [];
  try { tags = JSON.parse(e.tags || "[]"); } catch { tags = []; }
  return { ...e, tags };
}

module.exports = router;
