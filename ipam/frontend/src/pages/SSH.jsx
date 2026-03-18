import { useState, useEffect, useRef, useCallback } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { api } from "../lib/api.js";
import { useTheme } from "../hooks/useTheme.jsx";
import { useAuth } from "../hooks/useAuth.jsx";
import { Icon } from "../components/UI.jsx";

// ── xterm theme tokens ────────────────────────────────────────────────────────
function xtermTheme(isDark) {
  return isDark
    ? { background: "#0f1117", foreground: "#c9d1d9", cursor: "#58a6ff", selectionBackground: "#264f78", black: "#161b22", red: "#ff7b72", green: "#3fb950", yellow: "#d29922", blue: "#58a6ff", magenta: "#bc8cff", cyan: "#39c5cf", white: "#b1bac4", brightBlack: "#6e7681", brightRed: "#ffa198", brightGreen: "#56d364", brightYellow: "#e3b341", brightBlue: "#79c0ff", brightMagenta: "#d2a8ff", brightCyan: "#56d3c9", brightWhite: "#f0f6fc" }
    : { background: "#ffffff", foreground: "#24292f", cursor: "#0969da", selectionBackground: "#b6d7ff", black: "#24292f", red: "#cf222e", green: "#1a7f37", yellow: "#9a6700", blue: "#0969da", magenta: "#8250df", cyan: "#0550ae", white: "#6e7781", brightBlack: "#57606a", brightRed: "#a40e26", brightGreen: "#2da44e", brightYellow: "#bf8700", brightBlue: "#218bff", brightMagenta: "#a475f9", brightCyan: "#0969da", brightWhite: "#24292f" };
}

// ── Icons ─────────────────────────────────────────────────────────────────────
const ICON_TERMINAL = "M8 9l3 3-3 3M13 15h3M3 6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6z";
const ICON_PLUS     = "M12 5v14M5 12h14";
const ICON_TRASH    = "M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6";
const ICON_EDIT     = "M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z";
const ICON_CLOSE    = "M18 6L6 18M6 6l12 12";
const ICON_KEY      = "M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4";
const ICON_LOCK     = "M12 17a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm6-5V9a6 6 0 1 0-12 0v3m12 0H6a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2z";

let sessionCounter = 0;
function nextId() { return `s${++sessionCounter}`; }

// ── Empty connection form state ───────────────────────────────────────────────
const EMPTY_FORM = { name: "", host: "", port: "22", username: "", auth_type: "password", secret: "" };

export default function SSH() {
  const { resolved } = useTheme();
  const isDark = resolved !== "light";
  const { user } = useAuth();

  // Close all WebSocket sessions when the user logs out
  useEffect(() => {
    if (!user) {
      Object.keys(wsRefs.current).forEach(id => {
        try { wsRefs.current[id]?.close(); } catch {}
        delete wsRefs.current[id];
      });
      Object.keys(termRefs.current).forEach(id => {
        try { termRefs.current[id]?.term?.dispose(); } catch {}
        delete termRefs.current[id];
      });
      setSessions([]);
      setActiveTab(null);
    }
  }, [user]);

  const [hosts, setHosts]       = useState([]);
  const [sessions, setSessions] = useState([]);    // [{ id, label, status, hostId? }]
  const [activeTab, setActiveTab] = useState(null);

  // host modal
  const [modal, setModal] = useState(null); // null | 'add' | 'edit'
  const [editingHost, setEditingHost] = useState(null);
  const [form, setForm]   = useState(EMPTY_FORM);
  const [formErr, setFormErr] = useState("");
  const [saving, setSaving]   = useState(false);

  // confirm delete
  const [confirmDelete, setConfirmDelete] = useState(null); // host id

  // per-session xterm + ws refs
  const termRefs = useRef({}); // id → { term, fitAddon, initialized }
  const wsRefs   = useRef({}); // id → WebSocket
  const divRefs  = useRef({}); // id → DOM div element

  // ── Load hosts ──────────────────────────────────────────────────────────────
  useEffect(() => { loadHosts(); }, []);

  async function loadHosts() {
    try { setHosts(await api.getSshHosts()); } catch {}
  }

  // ── Session management ──────────────────────────────────────────────────────
  function openSession(host) {
    const id = nextId();
    const newSession = { id, label: host ? `${host.username}@${host.host}` : "Nuova sessione", status: "idle", hostId: host?.id };
    setSessions(prev => [...prev, newSession]);
    setActiveTab(id);
    if (host) {
      // auto-connect after mount via flag
      newSession._autoConnectHost = host;
    }
    return id;
  }

  function openBlankSession() {
    const id = nextId();
    setSessions(prev => [...prev, { id, label: "Nuova sessione", status: "idle" }]);
    setActiveTab(id);
  }

  function closeSession(id) {
    // cleanup ws + xterm
    const ws = wsRefs.current[id];
    if (ws) { try { ws.close(); } catch {} delete wsRefs.current[id]; }
    const t = termRefs.current[id];
    if (t) { try { t.term.dispose(); } catch {} delete termRefs.current[id]; }
    delete divRefs.current[id];

    setSessions(prev => {
      const next = prev.filter(s => s.id !== id);
      if (activeTab === id) setActiveTab(next.length > 0 ? next[next.length - 1].id : null);
      return next;
    });
  }

  function updateSessionStatus(id, status, label) {
    setSessions(prev => prev.map(s => s.id === id ? { ...s, status, ...(label ? { label } : {}) } : s));
  }

  // ── xterm init (called when a session div mounts) ───────────────────────────
  const initTerm = useCallback((id, el) => {
    if (!el || termRefs.current[id]) return;
    const term = new Terminal({
      theme: xtermTheme(isDark),
      fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
      fontSize: 13,
      lineHeight: 1.4,
      cursorBlink: true,
      allowTransparency: false,
    });
    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(el);
    fitAddon.fit();
    termRefs.current[id] = { term, fitAddon };

    // resize observer
    const ro = new ResizeObserver(() => {
      try { fitAddon.fit(); } catch {}
      const ws = wsRefs.current[id];
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "resize", cols: term.cols, rows: term.rows }));
      }
    });
    ro.observe(el);
    termRefs.current[id].ro = ro;
  }, [isDark]);

  // ── SSH connect ─────────────────────────────────────────────────────────────
  async function connectSession(id, params) {
    // params: { hostId } or { host, port, username, authType, secret }
    updateSessionStatus(id, "connecting");

    // Get a one-time ticket instead of sending JWT in the URL
    let ticket;
    try {
      const res = await api.getWsTicket();
      ticket = res.ticket;
    } catch (e) {
      updateSessionStatus(id, "error");
      return;
    }
    const proto = window.location.protocol === "https:" ? "wss" : "ws";
    const wsUrl = `${proto}://${window.location.host}/ws/ssh?ticket=${encodeURIComponent(ticket)}`;
    const ws = new WebSocket(wsUrl);
    wsRefs.current[id] = ws;

    ws.onopen = () => {
      if (params.hostId) {
        ws.send(JSON.stringify({ type: "connect", hostId: params.hostId }));
      } else {
        ws.send(JSON.stringify({
          type: "connect_manual",
          host: params.host,
          port: parseInt(params.port, 10),
          username: params.username,
          authType: params.authType,
          secret: params.secret,
        }));
      }
    };

    ws.onmessage = (e) => {
      let msg;
      try { msg = JSON.parse(e.data); } catch { return; }

      const t = termRefs.current[id];

      if (msg.type === "connected") {
        updateSessionStatus(id, "connected");
        if (t) t.term.onData((data) => {
          if (wsRefs.current[id]?.readyState === WebSocket.OPEN) {
            wsRefs.current[id].send(JSON.stringify({ type: "data", data }));
          }
        });
        return;
      }
      if (msg.type === "data" && t) {
        t.term.write(msg.data);
        return;
      }
      if (msg.type === "error") {
        if (t) t.term.writeln(`\r\n\x1b[31mErrore: ${msg.message}\x1b[0m\r\n`);
        updateSessionStatus(id, "error");
        return;
      }
      if (msg.type === "closed") {
        if (t) t.term.writeln("\r\n\x1b[33mConnessione chiusa.\x1b[0m");
        updateSessionStatus(id, "closed");
        return;
      }
    };

    ws.onerror = () => {
      const t = termRefs.current[id];
      if (t) t.term.writeln("\r\n\x1b[31mErrore WebSocket.\x1b[0m");
      updateSessionStatus(id, "error");
    };

    ws.onclose = () => {
      const t = termRefs.current[id];
      if (t) t.term.writeln("\r\n\x1b[33mSessione terminata.\x1b[0m");
      setSessions(prev => prev.map(s => s.id === id && s.status === "connected" ? { ...s, status: "closed" } : s));
    };
  }

  // ── Host modal ──────────────────────────────────────────────────────────────
  function openAddModal() { setForm(EMPTY_FORM); setFormErr(""); setEditingHost(null); setModal("add"); }
  function openEditModal(h) {
    setForm({ name: h.name, host: h.host, port: String(h.port), username: h.username, auth_type: h.auth_type, secret: "" });
    setFormErr("");
    setEditingHost(h);
    setModal("edit");
  }
  function closeModal() { setModal(null); setEditingHost(null); }

  async function saveHost() {
    const { name, host, port, username, auth_type, secret } = form;
    if (!name.trim()) { setFormErr("Nome obbligatorio"); return; }
    if (!host.trim()) { setFormErr("Host obbligatorio"); return; }
    const p = parseInt(port, 10);
    if (isNaN(p) || p < 1 || p > 65535) { setFormErr("Porta non valida (1–65535)"); return; }
    if (!username.trim()) { setFormErr("Username obbligatorio"); return; }
    if (modal === "add" && !secret.trim()) { setFormErr("Secret (password o chiave) obbligatorio"); return; }

    setSaving(true); setFormErr("");
    try {
      const payload = { name: name.trim(), host: host.trim(), port: p, username: username.trim(), auth_type, secret: secret.trim() };
      if (modal === "add") {
        const created = await api.createSshHost(payload);
        setHosts(prev => [...prev, created]);
      } else {
        const updated = await api.updateSshHost(editingHost.id, payload);
        setHosts(prev => prev.map(h => h.id === editingHost.id ? updated : h));
      }
      closeModal();
    } catch (e) {
      setFormErr(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function deleteHost(id) {
    try {
      await api.deleteSshHost(id);
      setHosts(prev => prev.filter(h => h.id !== id));
    } catch {}
    setConfirmDelete(null);
  }

  // ── Styles ──────────────────────────────────────────────────────────────────
  const c = {
    page:      { display: "flex", height: "calc(100vh - 0px)", overflow: "hidden" },
    sidebar:   { width: 220, flexShrink: 0, background: "var(--bg-surface)", borderRight: "1px solid var(--border-subtle)", display: "flex", flexDirection: "column" },
    sideHead:  { padding: "14px 12px 10px", borderBottom: "1px solid var(--border-subtle)", display: "flex", alignItems: "center", justifyContent: "space-between" },
    sideTitle: { fontSize: 11, fontWeight: 600, color: "var(--text-ghost)", letterSpacing: "0.08em", textTransform: "uppercase" },
    addBtn:    { background: "var(--accent)", border: "none", color: "#fff", cursor: "pointer", padding: "4px 8px", borderRadius: 6, fontSize: 11, fontFamily: "inherit", display: "flex", alignItems: "center", gap: 4 },
    hostList:  { flex: 1, overflowY: "auto", padding: "6px 0" },
    hostItem:  (active) => ({ padding: "8px 12px", cursor: "pointer", borderLeft: `2px solid ${active ? "var(--accent)" : "transparent"}`, background: active ? "var(--bg-raised)" : "transparent", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 6, transition: "all 0.1s" }),
    hostName:  { fontSize: 12, fontWeight: 600, color: "var(--text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
    hostSub:   { fontSize: 10, color: "var(--text-ghost)", marginTop: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
    hostActions:{ display: "flex", gap: 2, flexShrink: 0, opacity: 0 },
    area:      { flex: 1, display: "flex", flexDirection: "column", minWidth: 0, background: "var(--bg-base)" },
    tabBar:    { display: "flex", alignItems: "center", borderBottom: "1px solid var(--border-subtle)", background: "var(--bg-surface)", overflowX: "auto", flexShrink: 0 },
    tab:       (active) => ({ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", cursor: "pointer", color: active ? "var(--text-primary)" : "var(--text-faint)", fontSize: 12, fontWeight: active ? 600 : 400, whiteSpace: "nowrap", flexShrink: 0, transition: "all 0.12s", background: "transparent", border: "none", borderBottom: `2px solid ${active ? "var(--accent)" : "transparent"}`, fontFamily: "inherit" }),
    tabNewBtn: { padding: "8px 12px", background: "none", border: "none", color: "var(--text-ghost)", cursor: "pointer", fontSize: 18, lineHeight: 1, display: "flex", alignItems: "center", transition: "color 0.1s", flexShrink: 0 },
    content:   { flex: 1, position: "relative", overflow: "hidden" },
    termWrap:  (visible) => ({ position: "absolute", inset: 0, padding: 0, display: visible ? "flex" : "none", flexDirection: "column" }),
    termDiv:   { flex: 1, overflow: "hidden" },
    empty:     { flex: 1, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 12, color: "var(--text-ghost)" },
    statusDot: (status) => {
      const colors = { idle: "var(--text-ghost)", connecting: "#f59e0b", connected: "#22c55e", error: "#ef4444", closed: "var(--text-ghost)" };
      return { width: 7, height: 7, borderRadius: "50%", background: colors[status] || "var(--text-ghost)", flexShrink: 0 };
    },
  };

  // ── Connection form (rendered inside a tab when not yet connected) ───────────
  function ConnectForm({ sessionId, defaultHostId }) {
    const sess = sessions.find(s => s.id === sessionId);
    const [f, setF] = useState({ host: "", port: "22", username: "", auth_type: "password", secret: "" });
    const [err, setErr] = useState("");
    const [connecting, setConnecting] = useState(false);

    useEffect(() => {
      if (defaultHostId) {
        connectSession(sessionId, { hostId: defaultHostId });
      }
    }, []);

    if (sess?.status === "connecting") {
      return (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 10, color: "var(--text-muted)" }}>
          <div style={{ fontSize: 13 }}>Connessione in corso...</div>
        </div>
      );
    }

    function handleConnect() {
      if (!f.host.trim()) { setErr("Host obbligatorio"); return; }
      if (!f.username.trim()) { setErr("Username obbligatorio"); return; }
      if (!f.secret.trim()) { setErr("Secret obbligatorio"); return; }
      setErr(""); setConnecting(true);
      connectSession(sessionId, { host: f.host.trim(), port: f.port, username: f.username.trim(), authType: f.auth_type, secret: f.secret });
    }

    const inp = { background: "var(--bg-raised)", border: "1px solid var(--border-default)", color: "var(--text-primary)", padding: "7px 10px", borderRadius: 6, fontSize: 12, fontFamily: "inherit", width: "100%", boxSizing: "border-box" };

    return (
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)", borderRadius: 12, padding: 28, width: 340, display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Icon d={ICON_TERMINAL} size={16} style={{ color: "var(--accent)" }} />
            <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>Nuova connessione SSH</span>
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 10, color: "var(--text-ghost)", marginBottom: 4 }}>HOST</div>
              <input style={inp} value={f.host} onChange={e => setF(p => ({ ...p, host: e.target.value }))} placeholder="192.168.1.1" />
            </div>
            <div style={{ width: 70 }}>
              <div style={{ fontSize: 10, color: "var(--text-ghost)", marginBottom: 4 }}>PORTA</div>
              <input style={inp} value={f.port} onChange={e => setF(p => ({ ...p, port: e.target.value }))} placeholder="22" />
            </div>
          </div>

          <div>
            <div style={{ fontSize: 10, color: "var(--text-ghost)", marginBottom: 4 }}>USERNAME</div>
            <input style={inp} value={f.username} onChange={e => setF(p => ({ ...p, username: e.target.value }))} placeholder="root" />
          </div>

          <div>
            <div style={{ fontSize: 10, color: "var(--text-ghost)", marginBottom: 4 }}>TIPO AUTH</div>
            <select style={inp} value={f.auth_type} onChange={e => setF(p => ({ ...p, auth_type: e.target.value }))}>
              <option value="password">Password</option>
              <option value="key">Chiave privata</option>
            </select>
          </div>

          <div>
            <div style={{ fontSize: 10, color: "var(--text-ghost)", marginBottom: 4 }}>
              {f.auth_type === "key" ? "CHIAVE PRIVATA (PEM)" : "PASSWORD"}
            </div>
            {f.auth_type === "key"
              ? <textarea style={{ ...inp, height: 90, resize: "vertical", fontFamily: "monospace" }} value={f.secret} onChange={e => setF(p => ({ ...p, secret: e.target.value }))} placeholder="-----BEGIN OPENSSH PRIVATE KEY-----" />
              : <input style={inp} type="password" value={f.secret} onChange={e => setF(p => ({ ...p, secret: e.target.value }))} onKeyDown={e => e.key === "Enter" && handleConnect()} placeholder="••••••••" />
            }
          </div>

          {err && <div style={{ fontSize: 11, color: "#ef4444" }}>{err}</div>}

          <button onClick={handleConnect} disabled={connecting}
            style={{ background: "var(--accent)", border: "none", color: "#fff", padding: "9px 16px", borderRadius: 7, fontSize: 13, fontFamily: "inherit", cursor: connecting ? "default" : "pointer", opacity: connecting ? 0.7 : 1 }}>
            Connetti
          </button>
        </div>
      </div>
    );
  }

  // ── Modal ───────────────────────────────────────────────────────────────────
  function HostModal() {
    const inp = { background: "var(--bg-raised)", border: "1px solid var(--border-default)", color: "var(--text-primary)", padding: "7px 10px", borderRadius: 6, fontSize: 12, fontFamily: "inherit", width: "100%", boxSizing: "border-box" };
    return (
      <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }} onClick={closeModal}>
        <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)", borderRadius: 12, padding: 28, width: 380, boxShadow: "var(--shadow-modal)", display: "flex", flexDirection: "column", gap: 14 }} onClick={e => e.stopPropagation()}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>
            {modal === "add" ? "Aggiungi host SSH" : "Modifica host SSH"}
          </div>

          <div>
            <div style={{ fontSize: 10, color: "var(--text-ghost)", marginBottom: 4 }}>NOME</div>
            <input style={inp} value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="Server produzione" />
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 10, color: "var(--text-ghost)", marginBottom: 4 }}>HOST</div>
              <input style={inp} value={form.host} onChange={e => setForm(p => ({ ...p, host: e.target.value }))} placeholder="192.168.1.1" />
            </div>
            <div style={{ width: 70 }}>
              <div style={{ fontSize: 10, color: "var(--text-ghost)", marginBottom: 4 }}>PORTA</div>
              <input style={inp} value={form.port} onChange={e => setForm(p => ({ ...p, port: e.target.value }))} />
            </div>
          </div>

          <div>
            <div style={{ fontSize: 10, color: "var(--text-ghost)", marginBottom: 4 }}>USERNAME</div>
            <input style={inp} value={form.username} onChange={e => setForm(p => ({ ...p, username: e.target.value }))} placeholder="root" />
          </div>

          <div>
            <div style={{ fontSize: 10, color: "var(--text-ghost)", marginBottom: 4 }}>TIPO AUTH</div>
            <select style={inp} value={form.auth_type} onChange={e => setForm(p => ({ ...p, auth_type: e.target.value }))}>
              <option value="password">Password</option>
              <option value="key">Chiave privata</option>
            </select>
          </div>

          <div>
            <div style={{ fontSize: 10, color: "var(--text-ghost)", marginBottom: 4 }}>
              {form.auth_type === "key" ? "CHIAVE PRIVATA (PEM)" : "PASSWORD"}
              {modal === "edit" && <span style={{ color: "var(--text-ghost)", marginLeft: 4 }}>(lascia vuoto per non cambiare)</span>}
            </div>
            {form.auth_type === "key"
              ? <textarea style={{ ...inp, height: 90, resize: "vertical", fontFamily: "monospace" }} value={form.secret} onChange={e => setForm(p => ({ ...p, secret: e.target.value }))} placeholder="-----BEGIN OPENSSH PRIVATE KEY-----" />
              : <input style={inp} type="password" value={form.secret} onChange={e => setForm(p => ({ ...p, secret: e.target.value }))} placeholder="••••••••" />
            }
          </div>

          {formErr && <div style={{ fontSize: 11, color: "#ef4444" }}>{formErr}</div>}

          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button onClick={closeModal} style={{ background: "none", border: "1px solid var(--border-default)", color: "var(--text-faint)", padding: "7px 14px", borderRadius: 6, fontSize: 12, fontFamily: "inherit", cursor: "pointer" }}>Annulla</button>
            <button onClick={saveHost} disabled={saving} style={{ background: "var(--accent)", border: "none", color: "#fff", padding: "7px 16px", borderRadius: 6, fontSize: 12, fontFamily: "inherit", cursor: saving ? "default" : "pointer", opacity: saving ? 0.7 : 1 }}>
              {saving ? "Salvataggio..." : "Salva"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Confirm delete modal ─────────────────────────────────────────────────────
  function ConfirmDeleteModal({ host }) {
    return (
      <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }} onClick={() => setConfirmDelete(null)}>
        <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)", borderRadius: 12, padding: 24, width: 320, boxShadow: "var(--shadow-modal)" }} onClick={e => e.stopPropagation()}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", marginBottom: 8 }}>Elimina host</div>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 20 }}>
            Eliminare <strong>{host.name}</strong> ({host.username}@{host.host})?
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button onClick={() => setConfirmDelete(null)} style={{ background: "none", border: "1px solid var(--border-default)", color: "var(--text-faint)", padding: "7px 14px", borderRadius: 6, fontSize: 12, fontFamily: "inherit", cursor: "pointer" }}>Annulla</button>
            <button onClick={() => deleteHost(host.id)} style={{ background: "#ef4444", border: "none", color: "#fff", padding: "7px 16px", borderRadius: 6, fontSize: 12, fontFamily: "inherit", cursor: "pointer" }}>Elimina</button>
          </div>
        </div>
      </div>
    );
  }

  // ── Session terminal panel ───────────────────────────────────────────────────
  function SessionPane({ session }) {
    const divRef = useRef(null);
    const paneRef = useRef(null);
    const visible = activeTab === session.id;

    // Register div ref in parent's map
    useEffect(() => {
      if (divRef.current) {
        divRefs.current[session.id] = divRef.current;
        initTerm(session.id, divRef.current);
      }
      return () => {
        if (divRefs.current[session.id] === divRef.current) delete divRefs.current[session.id];
      };
    }, []);

    // Fit when becoming visible
    useEffect(() => {
      if (visible) {
        setTimeout(() => {
          const t = termRefs.current[session.id];
          if (t) { try { t.fitAddon.fit(); } catch {} }
        }, 30);
      }
    }, [visible]);

    const showForm = ["idle", "error"].includes(session.status) || !termRefs.current[session.id];

    return (
      <div ref={paneRef} style={c.termWrap(visible)}>
        {showForm
          ? <ConnectForm sessionId={session.id} defaultHostId={session.hostId} />
          : <div ref={divRef} style={c.termDiv} />
        }
        {/* If we already initialized the term but status flipped to idle/error, keep the div for xterm but overlay the form */}
      </div>
    );
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div style={c.page}>
      {/* ── Sidebar ── */}
      <div style={c.sidebar}>
        <div style={c.sideHead}>
          <span style={c.sideTitle}>Host salvati</span>
          <button style={c.addBtn} onClick={openAddModal}>
            <Icon d={ICON_PLUS} size={11} />
            Aggiungi
          </button>
        </div>

        <div style={c.hostList}>
          {hosts.length === 0 && (
            <div style={{ padding: "20px 12px", fontSize: 11, color: "var(--text-ghost)", textAlign: "center" }}>
              Nessun host salvato
            </div>
          )}
          {hosts.map(h => (
            <div key={h.id}
              style={c.hostItem(false)}
              onMouseEnter={e => { e.currentTarget.querySelector(".host-actions").style.opacity = 1; }}
              onMouseLeave={e => { e.currentTarget.querySelector(".host-actions").style.opacity = 0; }}>
              <div style={{ minWidth: 0, flex: 1, cursor: "pointer" }} onClick={() => {
                const id = nextId();
                setSessions(prev => [...prev, { id, label: `${h.username}@${h.host}`, status: "idle", hostId: h.id }]);
                setActiveTab(id);
              }}>
                <div style={c.hostName}>{h.name}</div>
                <div style={c.hostSub}>{h.username}@{h.host}:{h.port}</div>
                <div style={{ fontSize: 9, color: "var(--text-ghost)", marginTop: 2, display: "flex", alignItems: "center", gap: 3 }}>
                  <Icon d={h.auth_type === "key" ? ICON_KEY : ICON_LOCK} size={9} />
                  {h.auth_type === "key" ? "Chiave privata" : "Password"}
                </div>
              </div>
              <div className="host-actions" style={{ ...c.hostActions, opacity: 0 }}>
                <button onClick={e => { e.stopPropagation(); openEditModal(h); }}
                  style={{ background: "none", border: "none", color: "var(--text-ghost)", cursor: "pointer", padding: 3, borderRadius: 4, display: "flex" }}
                  title="Modifica">
                  <Icon d={ICON_EDIT} size={12} />
                </button>
                <button onClick={e => { e.stopPropagation(); setConfirmDelete(h); }}
                  style={{ background: "none", border: "none", color: "var(--text-ghost)", cursor: "pointer", padding: 3, borderRadius: 4, display: "flex" }}
                  title="Elimina"
                  onMouseEnter={e => { e.currentTarget.style.color = "#ef4444"; }}
                  onMouseLeave={e => { e.currentTarget.style.color = "var(--text-ghost)"; }}>
                  <Icon d={ICON_TRASH} size={12} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Session area ── */}
      <div style={c.area}>
        {/* Tab bar */}
        <div style={c.tabBar}>
          {sessions.map(s => (
            <button key={s.id} style={c.tab(activeTab === s.id)} onClick={() => setActiveTab(s.id)}>
              <span style={c.statusDot(s.status)} />
              <span style={{ maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis" }}>{s.label}</span>
              <span
                style={{ marginLeft: 2, color: "var(--text-ghost)", display: "flex", alignItems: "center", borderRadius: 3, padding: "1px 2px" }}
                onClick={e => { e.stopPropagation(); closeSession(s.id); }}
                onMouseEnter={e => { e.currentTarget.style.color = "#ef4444"; e.currentTarget.style.background = "rgba(239,68,68,0.1)"; }}
                onMouseLeave={e => { e.currentTarget.style.color = "var(--text-ghost)"; e.currentTarget.style.background = "transparent"; }}>
                <Icon d={ICON_CLOSE} size={10} />
              </span>
            </button>
          ))}
          <button style={c.tabNewBtn} title="Nuova sessione" onClick={openBlankSession}
            onMouseEnter={e => { e.currentTarget.style.color = "var(--accent)"; }}
            onMouseLeave={e => { e.currentTarget.style.color = "var(--text-ghost)"; }}>
            +
          </button>
        </div>

        {/* Content */}
        <div style={c.content}>
          {sessions.length === 0 && (
            <div style={c.empty}>
              <Icon d={ICON_TERMINAL} size={40} style={{ opacity: 0.2 }} />
              <div style={{ fontSize: 13 }}>Nessuna sessione aperta</div>
              <div style={{ fontSize: 11 }}>Clicca su un host o su <strong>+</strong> per iniziare</div>
            </div>
          )}
          {sessions.map(s => (
            <SessionPane key={s.id} session={s} />
          ))}
        </div>
      </div>

      {/* Modals */}
      {(modal === "add" || modal === "edit") && <HostModal />}
      {confirmDelete && <ConfirmDeleteModal host={confirmDelete} />}

      {/* xterm CSS */}
      <style>{`
        @import url('https://cdn.jsdelivr.net/npm/@xterm/xterm@5.5.0/css/xterm.css');
        .xterm { height: 100%; }
        .xterm-viewport { overflow-y: hidden !important; }
      `}</style>
    </div>
  );
}
