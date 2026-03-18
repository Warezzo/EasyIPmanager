const WebSocket = require("ws");
const jwt       = require("jsonwebtoken");
const { Client: SshClient } = require("ssh2");
const { getHost, getDecryptedSecret } = require("./ssh");
const { decrypt } = require("../lib/crypto");

const SECRET = process.env.JWT_SECRET || "dev_secret_UNSAFE_do_not_use_in_production";

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

// ── Validate hostname/IP to prevent SSRF-style abuse ─────────────────────────
const VALID_HOST = /^[a-zA-Z0-9._-]+$/;

function send(ws, obj) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
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

    // ── JWT auth from query param ─────────────────────────────────────────────
    const token = url.searchParams.get("token");
    if (!token) {
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      socket.destroy();
      return;
    }
    try {
      jwt.verify(token, SECRET);
    } catch {
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      socket.destroy();
      return;
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit("connection", ws, req);
    });
  });

  wss.on("connection", (ws, req) => {
    const ip = req.socket.remoteAddress || "unknown";

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
        if (!host || !VALID_HOST.test(host) || !username || !secret) {
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

      // ── resize ────────────────────────────────────────────────────────────
      if (msg.type === "resize") {
        cols = parseInt(msg.cols, 10) || 80;
        rows = parseInt(msg.rows, 10) || 24;
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
        conn.shell({ term: "xterm-256color", cols, rows }, (err, stream) => {
          if (err) {
            send(ws, { type: "error", message: `Shell error: ${err.message}` });
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
        // Never log the secret — only log host/user info
        console.error(`SSH connection error [${username}@${host}:${port}]: ${err.message}`);
        send(ws, { type: "error", message: err.message });
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
