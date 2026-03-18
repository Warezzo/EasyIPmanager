const crypto = require("crypto");
const { SSH_ENCRYPTION_KEY } = require("./config");

const ALGORITHM = "aes-256-gcm";
const KEY_LEN   = 32;
const IV_LEN    = 16;
const TAG_LEN   = 16;
const SALT      = "ipam-ssh-v1";

// Derived once at first use — scryptSync is intentionally slow (~80-100 ms)
// and the key never changes at runtime, so caching avoids the cost on every
// encrypt/decrypt call.
let _cachedKey = null;
function getKey() {
  if (!_cachedKey) _cachedKey = crypto.scryptSync(SSH_ENCRYPTION_KEY, SALT, KEY_LEN);
  return _cachedKey;
}

/**
 * Encrypt plaintext → "iv:authTag:ciphertext" (all hex)
 */
function encrypt(plaintext) {
  const key = getKey();
  const iv  = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${tag.toString("hex")}:${encrypted.toString("hex")}`;
}

/**
 * Decrypt "iv:authTag:ciphertext" → plaintext
 */
function decrypt(encoded) {
  const [ivHex, tagHex, dataHex] = encoded.split(":");
  if (!ivHex || !tagHex || !dataHex) throw new Error("Invalid encrypted format");
  const key = getKey();
  const iv  = Buffer.from(ivHex,  "hex");
  const tag  = Buffer.from(tagHex, "hex");
  const data = Buffer.from(dataHex,"hex");
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}

module.exports = { encrypt, decrypt };
