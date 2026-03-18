/**
 * Validate SSH host targets — blocks SSRF-dangerous addresses.
 * Allows private ranges (10.x, 172.16.x, 192.168.x) — this is an IPAM tool.
 */

const VALID_HOSTNAME = /^([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)*[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/;
const VALID_IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

function isValidSshHost(host) {
  if (!host || typeof host !== "string") return false;
  if (host.length > 253) return false;

  // Block loopback
  if (host === "localhost" || host.startsWith("127.") || host === "::1") return false;

  // Block link-local / cloud metadata (AWS/GCP/Azure)
  if (host.startsWith("169.254.")) return false;

  // Block wildcard
  if (host === "0.0.0.0" || host === "::") return false;

  // IPv4 validation
  const ipMatch = VALID_IPV4.exec(host);
  if (ipMatch) {
    return [ipMatch[1], ipMatch[2], ipMatch[3], ipMatch[4]].every((o) => {
      const n = parseInt(o, 10);
      return n >= 0 && n <= 255;
    });
  }

  // Hostname validation (RFC 1123)
  return VALID_HOSTNAME.test(host);
}

module.exports = { isValidSshHost };
