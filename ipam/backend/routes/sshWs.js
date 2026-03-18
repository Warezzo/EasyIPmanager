const WebSocket = require("ws");
const { Client: SshClient } = require("ssh2");
const { getHost } = require("./ssh");
const { decrypt } = require("../lib/crypto");
const { validateTicket } = require("../lib/wsTickets");
const { isValidSshHost } = require("../lib/validateHost");

// ── Rate limit (in-memory: max 10 SSH connects / IP / minute) ────────────────
const connectAttempts = new Map(); // ip → { count, resetAt }

function checkRateLimit(ip) {
  const now = Date.now();
  let entry = connectAttempts.get(ip);
  if (!entry || now > entry.resetAt) {
    entry = { count: 0, resetAt: now + 60_000 };
  }
  entry.count++;
  connectAttempts.set(ip, entry);
  return entry.count <= 10;
}

function send(ws, obj) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
}

/**
 * Extract real client IP, respecting X-Forwarded-For when behind a proxy.
 */
function getClientIp(req) {
  const xff = req.headers["x-forwarded-for"];
  if (xff) return xff.split(",")[0].trim();
  return req.headers["x-real-ip"] || req.socket.remoteAddress || "unknown";
}

/**
 * Attach WebSocket SSH proxy to an existing HTTP server.
 * Handles upgrade requests at path /ws/ssh
 */
function attachSshWs(httpServer) {
  const wss = new WebSocket.Server({ noServer: true });

  httpServer.on("upgrade", (req, socket, head) => {
    const url = new URL(req.url, "http://localhost");
    if (url.pathname !== "/ws/ssh") return; // not our path, ignore

    // ── Auth via one-time ticket (replaces JWT in query param) ──────────────
    const ticket = url.searchParams.get("ticket");
    if (!ticket) {
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      socket.destroy();
      return;
    }
    const userId = validateTicket(ticket);
    if (!userId) {
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      socket.destroy();
      return;
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit("connection", ws, req);
    });
  });

  wss.on("connection", (ws, req) => {
    const ip = getClientIp(req);

    let sshConn      = null;
    let isConnecting = false;
    let sshStream    = null;
    let cols = 80;
    let rows = 24;

    ws.on("message", (raw) => {
      let msg;
      try { msg = JSON.parse(raw); } catch { return; }

      // ── connect (saved host) ──────────────────────────────────────────────
      if (msg.type === "connect" && msg.hostId) {
        if (!checkRateLimit(ip)) {
          send(ws, { type: "error", message: "Rate limit exceeded — riprova tra un minuto" });
          ws.close();
          return;
        }
        const host = getHost(msg.hostId);
        if (!host) {
          send(ws, { type: "error", message: "Host non trovato" });
          ws.close();
          return;
        }
        if (!isValidSshHost(host.host)) {
          send(ws, { type: "error", message: "Indirizzo host non consentito" });
          ws.close();
          return;
        }
        let secret;
        try { secret = decrypt(host.encrypted_secret); } catch (e) {
          console.error(`[SSH] Decryption failed for host ${host.id} — key may have changed: ${e.message}`);
          send(ws, { type: "error", message: "Credenziali non decifrabili — la chiave di cifratura potrebbe essere cambiata" });
          ws.close();
          return;
        }
        openSshSession({ host: host.host, port: host.port, username: host.username, authType: host.auth_type, secret });
        return;
      }

      // ── connect_manual ────────────────────────────────────────────────────
      if (msg.type === "connect_manual") {
        if (!checkRateLimit(ip)) {
          send(ws, { type: "error", message: "Rate limit exceeded — riprova tra un minuto" });
          ws.close();
          return;
        }
        const { host, port, username, authType, secret } = msg;
        if (!host || !isValidSshHost(host) || !username || !secret) {
          send(ws, { type: "error", message: "Parametri di connessione non validi" });
          return;
        }
        const p = parseInt(port, 10);
        if (isNaN(p) || p < 1 || p > 65535) {
          send(ws, { type: "error", message: "Porta non valida" });
          return;
        }
        openSshSession({ host, port: p, username, authType: authType || "password", secret });
        return;
      }

      // ── data (terminal input) ─────────────────────────────────────────────
      if (msg.type === "data" && sshStream) {
        sshStream.write(msg.data);
        return;
      }

      // ── resize (with range validation) ────────────────────────────────────
      if (msg.type === "resize") {
        const c = parseInt(msg.cols, 10) || 80;
        const r = parseInt(msg.rows, 10) || 24;
        cols = Math.max(1, Math.min(c, 512));
        rows = Math.max(1, Math.min(r, 256));
        if (sshStream) sshStream.setWindow(rows, cols, 0, 0);
        return;
      }
    });

    ws.on("close", () => {
      if (sshStream) { try { sshStream.end(); } catch {} }
      if (sshConn)   { try { sshConn.end();   } catch {} }
    });

    // ── SSH connection helper ─────────────────────────────────────────────────
    function openSshSession({ host, port, username, authType, secret }) {
      if (sshConn || isConnecting) return; // prevent duplicate connections
      isConnecting = true;

      const conn = new SshClient();
      sshConn = conn;

      const connConfig = {
        host,
        port,
        username,
        readyTimeout: 15_000,
        keepaliveInterval: 10_000,
      };

      if (authType === "key") {
        connConfig.privateKey = secret;
      } else {
        connConfig.password = secret;
      }

      conn.on("ready", () => {
        isConnecting = false;
        conn.shell({ term: "xterm-256color", cols, rows }, (err, stream) => {
          if (err) {
            send(ws, { type: "error", message: "Impossibile aprire la shell SSH" });
            ws.close();
            return;
          }
          sshStream = stream;
          send(ws, { type: "connected" });

          stream.on("data", (data) => {
            send(ws, { type: "data", data: data.toString("binary") });
          });
          stream.stderr.on("data", (data) => {
            send(ws, { type: "data", data: data.toString("binary") });
          });
          stream.on("close", () => {
            send(ws, { type: "closed" });
            ws.close();
          });
        });
      });

      conn.on("error", (err) => {
        isConnecting = false;
        // Log full error server-side — never expose details to client
        console.error(`SSH connection error [${username}@${host}:${port}]: ${err.message}`);
        send(ws, { type: "error", message: "Connessione SSH fallita" });
        ws.close();
      });

      conn.on("close", () => {
        isConnecting = false;
        sshConn = null;
        send(ws, { type: "closed" });
        if (ws.readyState === WebSocket.OPEN) ws.close();
      });

      conn.connect(connConfig);
    }
  });
}

module.exports = { attachSshWs };
