const express = require("express");
const { randomUUID } = require("crypto");
const { getDb } = require("../db");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);

const VALID_TYPES = new Set(["A", "AAAA", "CNAME", "MX", "TXT", "PTR", "NS", "SRV", "CAA"]);
const VALID_TYPES_LIST = [...VALID_TYPES].join(", ");

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
  if (!VALID_TYPES.has(type.toUpperCase())) return res.status(400).json({ error: `Invalid type. Must be one of: ${VALID_TYPES_LIST}` });
  const db = getDb();
  const id = randomUUID();
  const finalZone = zone.toLowerCase();
  const finalName = name.toLowerCase();
  const finalType = type.toUpperCase();
  const finalTTL = safeTTL(ttl);
  const finalPriority = priority || null;
  const finalIpEntryId = ip_entry_id || null;
  const finalDescription = description || null;
  const created_at = new Date().toISOString();
  db.prepare(`INSERT INTO dns_records (id,zone,name,type,value,ttl,priority,ip_entry_id,description,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)`)
    .run(id, finalZone, finalName, finalType, value, finalTTL, finalPriority, finalIpEntryId, finalDescription, created_at);
  res.status(201).json({ id, zone: finalZone, name: finalName, type: finalType, value, ttl: finalTTL, priority: finalPriority, ip_entry_id: finalIpEntryId, description: finalDescription, created_at });
});

// PUT /api/dns/:id
router.put("/:id", (req, res) => {
  const db = getDb();
  const existing = db.prepare("SELECT * FROM dns_records WHERE id=?").get(req.params.id);
  if (!existing) return res.status(404).json({ error: "Not found" });
  const { zone, name, type, value, ttl, priority, ip_entry_id, description } = req.body;
  const merged = {
    ...existing,
    zone:        (zone || existing.zone).toLowerCase(),
    name:        (name || existing.name).toLowerCase(),
    type:        (type || existing.type).toUpperCase(),
    value:       value ?? existing.value,
    ttl:         ttl !== undefined ? safeTTL(ttl, existing.ttl) : existing.ttl,
    priority:    priority ?? existing.priority,
    ip_entry_id: ip_entry_id ?? existing.ip_entry_id,
    description: description ?? existing.description,
  };
  db.prepare(`UPDATE dns_records SET zone=?,name=?,type=?,value=?,ttl=?,priority=?,ip_entry_id=?,description=? WHERE id=?`)
    .run(merged.zone, merged.name, merged.type, merged.value, merged.ttl, merged.priority, merged.ip_entry_id, merged.description, req.params.id);
  res.json(merged);
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
  const subnet = db.prepare("SELECT id FROM subnets WHERE id=?").get(req.params.subnetId);
  if (!subnet) return res.status(404).json({ error: "Subnet not found" });

  const zone = req.body.zone || "in-addr.arpa";
  if (!VALID_DNS_ZONE.test(zone) || zone.startsWith(".") || zone.endsWith(".")) {
    return res.status(400).json({ error: "Formato zona DNS non valido" });
  }

  const entries = db.prepare("SELECT id, ip, hostname FROM ip_entries WHERE subnet_id=?").all(req.params.subnetId);

  // Load all existing PTR names in this zone with a single query instead of
  // querying per-entry (avoids N+1 on large subnets)
  const existingNames = new Set(
    db.prepare("SELECT name FROM dns_records WHERE zone=? AND type='PTR'").all(zone).map((r) => r.name)
  );

  const insert = db.prepare(
    "INSERT INTO dns_records (id,zone,name,type,value,ttl,ip_entry_id) VALUES (?,?,?,?,?,?,?)"
  );
  let created = 0;
  const insertMany = db.transaction(() => {
    for (const entry of entries) {
      const reversed = entry.ip.split(".").reverse().join(".");
      if (!existingNames.has(reversed)) {
        insert.run(randomUUID(), zone, reversed, "PTR", entry.hostname + ".", 3600, entry.id);
        created++;
      }
    }
  });
  insertMany();

  res.json({ created, total: entries.length });
});

module.exports = router;
