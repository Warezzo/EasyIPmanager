const Database = require("better-sqlite3");
const path = require("path");

const DB_PATH = process.env.DB_PATH || path.join(__dirname, "../data/ipam.db");

let db;

function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
    initSchema();
  }
  return db;
}

function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS subnets (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      cidr        TEXT NOT NULL UNIQUE,
      vlan        TEXT,
      location    TEXT,
      description TEXT,
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS ip_entries (
      id          TEXT PRIMARY KEY,
      subnet_id   TEXT NOT NULL REFERENCES subnets(id) ON DELETE CASCADE,
      ip          TEXT NOT NULL,
      hostname    TEXT NOT NULL,
      mac         TEXT,
      type        TEXT NOT NULL DEFAULT 'other',
      description TEXT,
      tags        TEXT NOT NULL DEFAULT '[]',
      created_at  TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(subnet_id, ip)
    );

    CREATE TABLE IF NOT EXISTS dns_records (
      id          TEXT PRIMARY KEY,
      zone        TEXT NOT NULL,
      name        TEXT NOT NULL,
      type        TEXT NOT NULL,
      value       TEXT NOT NULL,
      ttl         INTEGER NOT NULL DEFAULT 3600,
      priority    INTEGER,
      ip_entry_id TEXT REFERENCES ip_entries(id) ON DELETE SET NULL,
      description TEXT,
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS scan_results (
      id          TEXT PRIMARY KEY,
      subnet_id   TEXT REFERENCES subnets(id) ON DELETE CASCADE,
      target      TEXT NOT NULL,
      status      TEXT NOT NULL DEFAULT 'pending',
      started_at  TEXT,
      finished_at TEXT,
      result      TEXT,
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_ip_entries_subnet ON ip_entries(subnet_id);
    CREATE INDEX IF NOT EXISTS idx_dns_zone ON dns_records(zone);
    CREATE INDEX IF NOT EXISTS idx_scans_subnet ON scan_results(subnet_id);
  `);
}

module.exports = { getDb };
