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
  const created_at = new Date().toISOString();
  const row = { id, name, cidr, vlan: vlan || null, location: location || null, description: description || null, created_at };
  try {
    db.prepare(`INSERT INTO subnets (id,name,cidr,vlan,location,description,created_at) VALUES (?,?,?,?,?,?,?)`)
      .run(id, name, cidr, row.vlan, row.location, row.description, created_at);
    res.status(201).json(row);
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
  const updated = {
    ...existing,
    name:        name        ?? existing.name,
    cidr:        cidr        ?? existing.cidr,
    vlan:        vlan        ?? existing.vlan,
    location:    location    ?? existing.location,
    description: description ?? existing.description,
  };
  try {
    db.prepare(`UPDATE subnets SET name=?,cidr=?,vlan=?,location=?,description=? WHERE id=?`)
      .run(updated.name, updated.cidr, updated.vlan, updated.location, updated.description, req.params.id);
    res.json(updated);
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
  const created_at = new Date().toISOString();
  const finalTags = JSON.stringify(tags || []);
  try {
    db.prepare(`INSERT INTO ip_entries (id,subnet_id,ip,hostname,mac,type,description,tags,created_at) VALUES (?,?,?,?,?,?,?,?,?)`)
      .run(id, req.params.id, ip, hostname, mac || null, type || "other", description || null, finalTags, created_at);
    res.status(201).json(parseEntry({ id, subnet_id: req.params.id, ip, hostname, mac: mac || null, type: type || "other", description: description || null, tags: finalTags, created_at }));
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
  const updatedTags = JSON.stringify(tags ?? JSON.parse(existing.tags));
  const updated = {
    ...existing,
    hostname:    hostname    ?? existing.hostname,
    mac:         mac         ?? existing.mac,
    type:        type        ?? existing.type,
    description: description ?? existing.description,
    tags:        updatedTags,
  };
  db.prepare(`UPDATE ip_entries SET hostname=?,mac=?,type=?,description=?,tags=? WHERE id=?`)
    .run(updated.hostname, updated.mac, updated.type, updated.description, updatedTags, req.params.id);
  res.json(parseEntry(updated));
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
