const express = require("express");
const { randomUUID } = require("crypto");
const { getDb } = require("../db");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);

const VALID_TYPES = ["A", "AAAA", "CNAME", "MX", "TXT", "PTR", "NS", "SRV", "CAA"];

// TTL must be between 60 s and ~68 years (max SQLite INTEGER); default 3600
function safeTTL(value, fallback = 3600) {
  const n = parseInt(value, 10);
  return !isNaN(n) && n >= 60 && n <= 2147483647 ? n : fallback;
}

// GET /api/dns?zone=example.local
router.get("/", (req, res) => {
  const db = getDb();
  const { zone } = req.query;
  const records = zone
    ? db.prepare("SELECT * FROM dns_records WHERE zone=? ORDER BY type,name ASC").all(zone)
    : db.prepare("SELECT * FROM dns_records ORDER BY zone,type,name ASC").all();
  res.json(records);
});

// GET /api/dns/zones
router.get("/zones", (req, res) => {
  const db = getDb();
  const zones = db.prepare("SELECT DISTINCT zone FROM dns_records ORDER BY zone ASC").all().map((r) => r.zone);
  res.json(zones);
});

// POST /api/dns
router.post("/", (req, res) => {
  const { zone, name, type, value, ttl, priority, ip_entry_id, description } = req.body;
  if (!zone || !name || !type || !value) return res.status(400).json({ error: "zone, name, type, value required" });
  if (!VALID_TYPES.includes(type.toUpperCase())) return res.status(400).json({ error: `Invalid type. Must be one of: ${VALID_TYPES.join(", ")}` });
  const db = getDb();
  const id = randomUUID();
  db.prepare(`INSERT INTO dns_records (id,zone,name,type,value,ttl,priority,ip_entry_id,description) VALUES (?,?,?,?,?,?,?,?,?)`)
    .run(id, zone.toLowerCase(), name.toLowerCase(), type.toUpperCase(), value, safeTTL(ttl), priority || null, ip_entry_id || null, description || null);
  res.status(201).json(db.prepare("SELECT * FROM dns_records WHERE id=?").get(id));
});

// PUT /api/dns/:id
router.put("/:id", (req, res) => {
  const db = getDb();
  const existing = db.prepare("SELECT * FROM dns_records WHERE id=?").get(req.params.id);
  if (!existing) return res.status(404).json({ error: "Not found" });
  const { zone, name, type, value, ttl, priority, ip_entry_id, description } = req.body;
  db.prepare(`UPDATE dns_records SET zone=?,name=?,type=?,value=?,ttl=?,priority=?,ip_entry_id=?,description=? WHERE id=?`)
    .run(
      (zone || existing.zone).toLowerCase(),
      (name || existing.name).toLowerCase(),
      (type || existing.type).toUpperCase(),
      value ?? existing.value,
      ttl !== undefined ? safeTTL(ttl, existing.ttl) : existing.ttl,
      priority ?? existing.priority,
      ip_entry_id ?? existing.ip_entry_id,
      description ?? existing.description,
      req.params.id
    );
  res.json(db.prepare("SELECT * FROM dns_records WHERE id=?").get(req.params.id));
});

// DELETE /api/dns/:id
router.delete("/:id", (req, res) => {
  const db = getDb();
  const r = db.prepare("DELETE FROM dns_records WHERE id=?").run(req.params.id);
  if (r.changes === 0) return res.status(404).json({ error: "Not found" });
  res.status(204).end();
});

const VALID_DNS_ZONE = /^[a-z0-9.-]+$/i;

// POST /api/dns/generate-ptr/:subnetId  — auto-generate PTR records from IP entries
router.post("/generate-ptr/:subnetId", (req, res) => {
  const db = getDb();
  const subnet = db.prepare("SELECT * FROM subnets WHERE id=?").get(req.params.subnetId);
  if (!subnet) return res.status(404).json({ error: "Subnet not found" });
  const entries = db.prepare("SELECT * FROM ip_entries WHERE subnet_id=?").all(req.params.subnetId);
  const zone = req.body.zone || "in-addr.arpa";
  if (!VALID_DNS_ZONE.test(zone) || zone.startsWith(".") || zone.endsWith(".")) {
    return res.status(400).json({ error: "Formato zona DNS non valido" });
  }
  let created = 0;
  for (const entry of entries) {
    const reversed = entry.ip.split(".").reverse().join(".");
    const existing = db.prepare("SELECT id FROM dns_records WHERE zone=? AND name=? AND type='PTR'").get(zone, reversed);
    if (!existing) {
      db.prepare(`INSERT INTO dns_records (id,zone,name,type,value,ttl,ip_entry_id) VALUES (?,?,?,?,?,?,?)`)
        .run(randomUUID(), zone, reversed, "PTR", entry.hostname + ".", 3600, entry.id);
      created++;
    }
  }
  res.json({ created, total: entries.length });
});

module.exports = router;
