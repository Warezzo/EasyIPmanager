const express = require("express");
const router  = express.Router();
const { randomUUID } = require("crypto");
const { getDb }      = require("../db");
const { requireAuth } = require("../middleware/auth");
const { encrypt, decrypt } = require("../lib/crypto");
const { isValidSshHost } = require("../lib/validateHost");

function validateHostPayload(body, requireSecret = true) {
  const { name, host, port, username, auth_type, secret } = body;
  if (!name || typeof name !== "string" || !name.trim())
    return "name is required";
  if (!host || !isValidSshHost(host))
    return "host must be a valid hostname or IP (localhost and link-local addresses are blocked)";
  const p = parseInt(port, 10);
  if (isNaN(p) || p < 1 || p > 65535)
    return "port must be 1–65535";
  if (!username || typeof username !== "string" || !username.trim())
    return "username is required";
  if (!["password", "key"].includes(auth_type))
    return "auth_type must be 'password' or 'key'";
  if (requireSecret && (!secret || typeof secret !== "string" || !secret.trim()))
    return "secret (password or private key) is required";
  return null;
}

// GET /api/ssh/hosts
router.get("/hosts", requireAuth, (req, res) => {
  const db = getDb();
  const rows = db.prepare(
    "SELECT id, name, host, port, username, auth_type, created_at FROM ssh_hosts ORDER BY name ASC"
  ).all();
  res.json(rows);
});

// POST /api/ssh/hosts
router.post("/hosts", requireAuth, (req, res) => {
  const err = validateHostPayload(req.body, true);
  if (err) return res.status(400).json({ error: err });

  const { name, host, port, username, auth_type, secret } = req.body;
  const id = randomUUID();
  const encrypted_secret = encrypt(secret.trim());

  getDb().prepare(
    "INSERT INTO ssh_hosts (id, name, host, port, username, auth_type, encrypted_secret) VALUES (?,?,?,?,?,?,?)"
  ).run(id, name.trim(), host.trim(), parseInt(port, 10), username.trim(), auth_type, encrypted_secret);

  res.status(201).json({ id, name: name.trim(), host: host.trim(), port: parseInt(port, 10), username: username.trim(), auth_type });
});

// PUT /api/ssh/hosts/:id
router.put("/hosts/:id", requireAuth, (req, res) => {
  const db = getDb();
  const row = db.prepare("SELECT id FROM ssh_hosts WHERE id=?").get(req.params.id);
  if (!row) return res.status(404).json({ error: "Not found" });

  const err = validateHostPayload(req.body, false);
  if (err) return res.status(400).json({ error: err });

  const { name, host, port, username, auth_type, secret } = req.body;
  const encrypted_secret = secret && secret.trim()
    ? encrypt(secret.trim())
    : db.prepare("SELECT encrypted_secret FROM ssh_hosts WHERE id=?").get(req.params.id).encrypted_secret;

  db.prepare(
    "UPDATE ssh_hosts SET name=?, host=?, port=?, username=?, auth_type=?, encrypted_secret=? WHERE id=?"
  ).run(name.trim(), host.trim(), parseInt(port, 10), username.trim(), auth_type, encrypted_secret, req.params.id);

  res.json({ id: req.params.id, name: name.trim(), host: host.trim(), port: parseInt(port, 10), username: username.trim(), auth_type });
});

// DELETE /api/ssh/hosts/:id
router.delete("/hosts/:id", requireAuth, (req, res) => {
  const db = getDb();
  const row = db.prepare("SELECT id FROM ssh_hosts WHERE id=?").get(req.params.id);
  if (!row) return res.status(404).json({ error: "Not found" });
  db.prepare("DELETE FROM ssh_hosts WHERE id=?").run(req.params.id);
  res.status(204).end();
});

module.exports = router;
module.exports.getDecryptedSecret = function(id) {
  const row = getDb().prepare("SELECT encrypted_secret, auth_type FROM ssh_hosts WHERE id=?").get(id);
  if (!row) return null;
  return { secret: decrypt(row.encrypted_secret), auth_type: row.auth_type };
};
module.exports.getHost = function(id) {
  return getDb().prepare("SELECT id, host, port, username, auth_type, encrypted_secret FROM ssh_hosts WHERE id=?").get(id);
};
