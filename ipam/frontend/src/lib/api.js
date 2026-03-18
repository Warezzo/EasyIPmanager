const BASE = "/api";

function getToken() {
  return localStorage.getItem("ipam_token");
}

async function request(method, path, body) {
  const token = getToken();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  let res;
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  } catch (err) {
    if (err.name === "AbortError") throw new Error("Timeout: il server non risponde");
    throw err;
  } finally {
    clearTimeout(timeout);
  }
  if (res.status === 401) {
    localStorage.removeItem("ipam_token");
    window.location.href = "/login";
    return;
  }
  if (res.status === 204) return null;
  let data;
  try {
    data = await res.json();
  } catch {
    throw new Error(`HTTP ${res.status}: risposta non valida dal server`);
  }
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

export const api = {
  // Auth
  login: (username, password) => request("POST", "/auth/login", { username, password }),
  me: () => request("GET", "/auth/me"),

  // Subnets
  getSubnets: () => request("GET", "/subnets"),
  createSubnet: (data) => request("POST", "/subnets", data),
  updateSubnet: (id, data) => request("PUT", `/subnets/${id}`, data),
  deleteSubnet: (id) => request("DELETE", `/subnets/${id}`),

  // IP Entries
  getEntries: (subnetId) => request("GET", `/subnets/${subnetId}/entries`),
  createEntry: (subnetId, data) => request("POST", `/subnets/${subnetId}/entries`, data),
  updateEntry: (subnetId, id, data) => request("PUT", `/subnets/${subnetId}/entries/${id}`, data),
  deleteEntry: (subnetId, id) => request("DELETE", `/subnets/${subnetId}/entries/${id}`),

  // DNS
  getDnsRecords: (zone) => request("GET", `/dns${zone ? `?zone=${encodeURIComponent(zone)}` : ""}`),
  getDnsZones: () => request("GET", "/dns/zones"),
  createDnsRecord: (data) => request("POST", "/dns", data),
  updateDnsRecord: (id, data) => request("PUT", `/dns/${id}`, data),
  deleteDnsRecord: (id) => request("DELETE", `/dns/${id}`),
  generatePTR: (subnetId, zone) => request("POST", `/dns/generate-ptr/${subnetId}`, { zone }),

  // Scanner
  getScans: () => request("GET", "/scanner"),
  getScan: (id) => request("GET", `/scanner/${id}`),
  startScan: (data) => request("POST", "/scanner/start", data),
  abortScan: (id) => request("POST", `/scanner/${id}/abort`),
  importHosts: (scanId, subnet_id, hosts) => request("POST", `/scanner/${scanId}/import`, { subnet_id, hosts }),
  deleteScan: (id) => request("DELETE", `/scanner/${id}`),

  // SSH Hosts
  getSshHosts: () => request("GET", "/ssh/hosts"),
  createSshHost: (data) => request("POST", "/ssh/hosts", data),
  updateSshHost: (id, data) => request("PUT", `/ssh/hosts/${id}`, data),
  deleteSshHost: (id) => request("DELETE", `/ssh/hosts/${id}`),

  // WebSocket auth (one-time ticket, replaces JWT in URL)
  getWsTicket: () => request("POST", "/auth/ws-ticket"),
};
