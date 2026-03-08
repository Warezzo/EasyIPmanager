export function cidrToInfo(cidr) {
  try {
    const [base, prefix] = cidr.split("/");
    const prefixLen = parseInt(prefix, 10);
    if (isNaN(prefixLen) || prefixLen < 0 || prefixLen > 32) return null;
    const parts = base.split(".").map(Number);
    if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) return null;
    const mask = prefixLen === 0 ? 0 : (~0 << (32 - prefixLen)) >>> 0;
    const baseInt = ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
    const networkInt = (baseInt & mask) >>> 0;
    const broadcastInt = (networkInt | (~mask >>> 0)) >>> 0;
    const toIP = (n) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join(".");
    const total = prefixLen >= 31 ? Math.pow(2, 32 - prefixLen) : Math.max(0, broadcastInt - networkInt - 1);
    return { prefix: prefixLen, total, networkAddr: toIP(networkInt), broadcastAddr: toIP(broadcastInt), networkInt, broadcastInt };
  } catch { return null; }
}

export function ipToInt(ip) {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) return null;
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

export function isIPInSubnet(ip, cidr) {
  const info = cidrToInfo(cidr);
  if (!info) return false;
  const n = ipToInt(ip);
  if (n === null) return false;
  // Per /31 e /30 permettiamo tutti gli indirizzi; per le subnet normali escludiamo network e broadcast
  if (info.prefix >= 31) return n >= info.networkInt && n <= info.broadcastInt;
  return n > info.networkInt && n < info.broadcastInt;
}

export function generateIPRange(cidr, limit = 512) {
  const info = cidrToInfo(cidr);
  if (!info) return [];
  const toIP = (n) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join(".");
  const start = info.prefix >= 31 ? info.networkInt : info.networkInt + 1;
  const end = info.prefix >= 31 ? info.broadcastInt : info.broadcastInt - 1;
  const ips = [];
  for (let i = start; i <= end && ips.length < limit; i++) ips.push(toIP(i));
  return ips;
}

export function formatDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("it-IT", { dateStyle: "short", timeStyle: "short" });
}
