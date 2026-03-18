const crypto = require("crypto");
const { SSH_ENCRYPTION_KEY } = require("./config");

const ALGORITHM = "aes-256-gcm";
const KEY_LEN   = 32;
const IV_LEN    = 16;
const TAG_LEN   = 16;
const SALT      = "ipam-ssh-v1";

function getKey() {
  return crypto.scryptSync(SSH_ENCRYPTION_KEY, SALT, KEY_LEN);
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
