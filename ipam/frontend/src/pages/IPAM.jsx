import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { api } from "../lib/api";
import { cidrToInfo, ipToInt, isIPInSubnet, generateIPRange } from "../lib/utils";
import { Icon, Modal, FormField, Button, Badge, SaturationBar, PageHeader, EmptyState, inputStyle, Toast, ConfirmModal } from "../components/UI";

const TYPE_COLORS = { server: "#6366f1", router: "#8b5cf6", switch: "#06b6d4", workstation: "#22c55e", printer: "#f97316", camera: "#ec4899", iot: "#eab308", other: "var(--text-muted)" };

function IPGrid({ cidr, usedIPs }) {
  const all = generateIPRange(cidr);
  const usedSet = new Map(usedIPs.map((e) => [e.ip, e]));
  const tooMany = all.length > 256;
  const display = tooMany ? all.slice(0, 256) : all;
  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 3, padding: "8px 0" }}>
        {display.map((ip) => {
          const entry = usedSet.get(ip);
          return (
            <div key={ip} title={entry ? `${ip} — ${entry.hostname} (${entry.type})` : ip}
              style={{ width: 14, height: 14, borderRadius: 2, background: entry ? "var(--accent)" : "var(--bg-raised)", border: `1px solid ${entry ? "var(--accent)" : "var(--bg-overlay)"}`, boxShadow: entry ? "0 0 4px color-mix(in srgb, var(--accent) 27%, transparent)" : "none", transition: "all 0.1s" }} />
          );
        })}
      </div>
      {tooMany && <div style={{ fontSize: 11, color: "var(--text-faint)" }}>Mostrati i primi 256 IP di {all.length}</div>}
      <div style={{ display: "flex", gap: 12, marginTop: 6, fontSize: 11, color: "var(--text-muted)" }}>
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ width: 10, height: 10, background: "var(--accent)", borderRadius: 2, display: "inline-block" }} /> Assegnato</span>
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ width: 10, height: 10, background: "var(--bg-raised)", border: "1px solid var(--border-default)", borderRadius: 2, display: "inline-block" }} /> Libero</span>
      </div>
    </div>
  );
}

function SubnetCard({ subnet, used, total, onSelect, onEdit, onDelete }) {
  const pct = total > 0 ? Math.round((used / total) * 100) : 0;
  const statusColor = pct >= 90 ? "#ef4444" : pct >= 70 ? "#f97316" : pct >= 50 ? "#eab308" : "#22c55e";
  return (
    <div className="subnet-card" onClick={() => onSelect(subnet)} style={{ background: "var(--bg-raised)", border: "1px solid var(--border-default)", borderRadius: 12, padding: 20, cursor: "pointer", transition: "all 0.2s", position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", top: 0, right: 0, width: 60, height: 60, background: `${statusColor}11`, borderRadius: "0 12px 0 60px" }} />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)" }}>{subnet.cidr}</span>
            {subnet.vlan && <Badge color="#475569">VLAN {subnet.vlan}</Badge>}
          </div>
          <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{subnet.name}{subnet.location ? ` · ${subnet.location}` : ""}</div>
        </div>
        <div style={{ display: "flex", gap: 6 }} onClick={(e) => e.stopPropagation()}>
          <button onClick={() => onEdit(subnet)} style={{ background: "var(--bg-overlay)", border: "1px solid var(--border-strong)", color: "var(--text-muted)", cursor: "pointer", padding: "4px 8px", borderRadius: 6, display: "flex", alignItems: "center" }}>
            <Icon d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" size={13} />
          </button>
          <button onClick={() => onDelete(subnet.id)} style={{ background: "var(--bg-overlay)", border: "1px solid var(--border-strong)", color: "#ef444466", cursor: "pointer", padding: "4px 8px", borderRadius: 6, display: "flex", alignItems: "center" }}>
            <Icon d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" size={13} />
          </button>
        </div>
      </div>
      <SaturationBar used={used} total={total} />
    </div>
  );
}

// ── Resizable Table ───────────────────────────────────────────────────────────

const COLS = [
  { key: "ip",          label: "IP",          defaultW: 130 },
  { key: "hostname",    label: "Hostname",    defaultW: 150 },
  { key: "description", label: "Descrizione", defaultW: 200 },
  { key: "mac",         label: "MAC",         defaultW: 140 },
  { key: "type",        label: "Tipo",        defaultW: 90  },
  { key: "actions",     label: "Azioni",      defaultW: 72  },
];
const COLS_STORAGE_KEY = "ipam_col_widths";

function ResizableHandle({ colKey, onMouseDown, isDragging }) {
  const [hovered, setHovered] = useState(false);
  const active = hovered || isDragging;
  return (
    <div
      onMouseDown={(e) => onMouseDown(e, colKey)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: 8, cursor: "col-resize", zIndex: 1, display: "flex", alignItems: "stretch", justifyContent: "center" }}>
      <div style={{ width: 2, borderRadius: 2, background: active ? "var(--accent)" : "var(--border-default)", transition: "background 0.15s" }} />
    </div>
  );
}

function ResizableTable({ entries, onEdit, onDelete, onBulkDelete }) {
  const [widths, setWidths] = useState(() => {
    const defaults = Object.fromEntries(COLS.map((c) => [c.key, c.defaultW]));
    try {
      const saved = localStorage.getItem(COLS_STORAGE_KEY);
      return saved ? { ...defaults, ...JSON.parse(saved) } : defaults;
    } catch { return defaults; }
  });
  const dragging = useRef(null);
  const [draggingKey, setDraggingKey] = useState(null);
  const [selectedIds, setSelectedIds] = useState(new Set());

  useEffect(() => {
    try { localStorage.setItem(COLS_STORAGE_KEY, JSON.stringify(widths)); } catch {}
  }, [widths]);

  // Clear selection whenever the entry list changes (subnet switch)
  useEffect(() => { setSelectedIds(new Set()); }, [entries]);

  const onMouseDown = (e, key) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startW = widths[key];
    dragging.current = { key, startX, startW };
    setDraggingKey(key);

    const onMove = (ev) => {
      if (!dragging.current) return;
      const delta = ev.clientX - dragging.current.startX;
      const newW = Math.max(50, dragging.current.startW + delta);
      setWidths((prev) => ({ ...prev, [dragging.current.key]: newW }));
    };

    const onUp = () => {
      dragging.current = null;
      setDraggingKey(null);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const sorted = useMemo(() => [...entries].sort((a, b) => (ipToInt(a.ip) || 0) - (ipToInt(b.ip) || 0)), [entries]);
  const allSelected = sorted.length > 0 && selectedIds.size === sorted.length;
  const toggleAll = () => setSelectedIds(allSelected ? new Set() : new Set(sorted.map((e) => e.id)));
  const toggleOne = (id) => setSelectedIds((prev) => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });

  const templateCols = `36px ${COLS.map((c) => `${widths[c.key]}px`).join(" ")}`;
  const cbStyle = { width: 14, height: 14, accentColor: "var(--accent)", cursor: "pointer" };

  return (
    <>
      {selectedIds.size > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 14px", marginBottom: 8, background: "var(--accent-bg)", border: "1px solid var(--accent)", borderRadius: 8, fontSize: 12, color: "var(--accent)" }}>
          <span style={{ flex: 1 }}>{selectedIds.size} IP selezionat{selectedIds.size === 1 ? "o" : "i"}</span>
          <button onClick={() => onBulkDelete([...selectedIds])}
            style={{ background: "#ef444422", border: "1px solid #ef444444", color: "#ef4444", cursor: "pointer", padding: "4px 12px", borderRadius: 6, fontSize: 12, fontFamily: "inherit" }}>
            Elimina selezionati
          </button>
          <button onClick={() => setSelectedIds(new Set())}
            style={{ background: "none", border: "1px solid var(--border-default)", color: "var(--text-muted)", cursor: "pointer", padding: "4px 10px", borderRadius: 6, fontSize: 12, fontFamily: "inherit" }}>
            Deseleziona
          </button>
        </div>
      )}
      <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)", borderRadius: 12, overflow: "auto", cursor: draggingKey ? "col-resize" : "auto", userSelect: draggingKey ? "none" : "auto" }}>
        <div style={{ minWidth: "fit-content" }}>
          {/* Header */}
          <div style={{ display: "grid", gridTemplateColumns: templateCols, borderBottom: "1px solid var(--border-subtle)", userSelect: "none" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "8px 0" }}>
              <input type="checkbox" checked={allSelected} onChange={toggleAll} style={cbStyle} />
            </div>
            {COLS.map((col) => (
              <div key={col.key} style={{ position: "relative", fontSize: 10, color: "var(--text-ghost)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                <div style={{ padding: "8px 16px 8px 12px", overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>
                  {col.label}
                </div>
                {col.key !== "actions" && (
                  <ResizableHandle colKey={col.key} onMouseDown={onMouseDown} isDragging={draggingKey === col.key} />
                )}
              </div>
            ))}
          </div>
          {/* Rows */}
          {entries.length === 0 ? (
            <div style={{ textAlign: "center", padding: 32, color: "var(--text-ghost)", fontSize: 13 }}>Nessun IP assegnato</div>
          ) : sorted.map((e) => {
            const isSelected = selectedIds.has(e.id);
            return (
              <div key={e.id}
                className={draggingKey ? undefined : "row-hover"}
                style={{ display: "grid", gridTemplateColumns: templateCols, borderBottom: "1px solid var(--border-subtle)", alignItems: "center", background: isSelected ? "var(--accent-bg)" : "transparent" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <input type="checkbox" checked={isSelected} onChange={() => toggleOne(e.id)} onClick={(ev) => ev.stopPropagation()} style={cbStyle} />
                </div>
                <div style={{ padding: "7px 12px", overflow: "hidden" }}>
                  <span style={{ fontFamily: "monospace", fontSize: 13, color: "var(--accent)", whiteSpace: "nowrap" }}>{e.ip}</span>
                </div>
                <div style={{ padding: "7px 12px", overflow: "hidden" }}>
                  <div style={{ fontSize: 13, color: "var(--text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{e.hostname}</div>
                </div>
                <div style={{ padding: "7px 12px", overflow: "hidden" }}>
                  <span style={{ fontSize: 13, color: "var(--text-secondary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", display: "block" }} title={e.description || ""}>{e.description || <span style={{ color: "var(--text-ghost)" }}>—</span>}</span>
                </div>
                <div style={{ padding: "7px 12px", overflow: "hidden" }}>
                  <span style={{ fontSize: 11, color: "var(--text-faint)", fontFamily: "monospace", whiteSpace: "nowrap" }}>{e.mac || "—"}</span>
                </div>
                <div style={{ padding: "7px 12px" }}>
                  <Badge color={TYPE_COLORS[e.type] || "var(--text-muted)"}>{e.type}</Badge>
                </div>
                <div style={{ padding: "7px 12px", display: "flex", gap: 4 }}>
                  <button className="icon-btn" onClick={() => onEdit(e)} style={{ padding: 4 }}><Icon d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" size={14} /></button>
                  <button className="icon-btn icon-btn-danger" onClick={() => onDelete(e.id)} style={{ padding: 4 }}><Icon d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" size={14} /></button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

// ── CSV Export ────────────────────────────────────────────────────────────────

function exportCSV(entries, subnet) {
  const rows = [["IP", "Hostname", "MAC", "Tipo", "Descrizione", "Tags"]];
  entries.forEach((e) =>
    rows.push([e.ip, e.hostname, e.mac || "", e.type, e.description || "", (e.tags || []).join(";")])
  );
  const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${subnet.name.replace(/\s+/g, "_")}_${subnet.cidr.replace(/\//g, "-")}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Page ──────────────────────────────────────────────────────────────────────

const emptySubnet = { name: "", cidr: "", vlan: "", location: "", description: "" };
const emptyEntry = { ip: "", hostname: "", mac: "", type: "server", description: "", tags: "" };

export default function IPAM() {
  const [subnets, setSubnets] = useState([]);
  const [entries, setEntries] = useState({}); // { subnetId: [...] }
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [detailView, setDetailView] = useState("table");
  const [modal, setModal] = useState(null);
  const [confirmModal, setConfirmModal] = useState(null); // { title, message, onConfirm, onCancel }
  const [editTarget, setEditTarget] = useState(null);
  const [subnetForm, setSubnetForm] = useState(emptySubnet);
  const [entryForm, setEntryForm] = useState(emptyEntry);
  const [errors, setErrors] = useState({});
  const [search, setSearch] = useState("");
  const [toast, setToast] = useState(null);

  const showToast = (msg, type = "success") => { setToast({ msg, type }); setTimeout(() => setToast(null), 3000); };

  // Load only subnets on mount — entries are lazy-loaded when a subnet is selected
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const subs = await api.getSubnets();
      setSubnets(subs);
    } catch (e) { showToast(e.message, "error"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const loadEntries = useCallback(async (subnetId) => {
    try {
      const e = await api.getEntries(subnetId);
      setEntries((prev) => ({ ...prev, [subnetId]: e }));
    } catch (e) { showToast(e.message, "error"); }
  }, []);

  // Lazy-load entries when a subnet is selected (only if not already cached)
  const handleSelect = (sub) => {
    if (selected?.id === sub.id) { setSelected(null); return; }
    setSelected(sub);
    if (!entries[sub.id]) loadEntries(sub.id);
  };

  // ── Subnet CRUD ──
  const openAddSubnet = () => { setSubnetForm(emptySubnet); setErrors({}); setEditTarget(null); setModal("subnet"); };
  const openEditSubnet = (s) => { setSubnetForm({ name: s.name, cidr: s.cidr, vlan: s.vlan || "", location: s.location || "", description: s.description || "" }); setErrors({}); setEditTarget(s); setModal("subnet"); };

  const saveSubnet = async () => {
    const errs = {};
    if (!subnetForm.name.trim()) errs.name = "Nome obbligatorio";
    if (!cidrToInfo(subnetForm.cidr)) errs.cidr = "CIDR non valido (es. 192.168.1.0/24)";
    if (Object.keys(errs).length) { setErrors(errs); return; }
    try {
      if (editTarget) {
        const updated = await api.updateSubnet(editTarget.id, subnetForm);
        setSubnets((prev) => prev.map((s) => s.id === editTarget.id ? updated : s));
        if (selected?.id === editTarget.id) setSelected(updated);
        showToast("Subnet aggiornata");
      } else {
        await api.createSubnet(subnetForm);
        await load();
        showToast("Subnet creata");
      }
      setModal(null);
    } catch (e) { showToast(e.message, "error"); }
  };

  const deleteSubnet = (id) => {
    setConfirmModal({
      title: "Elimina Subnet",
      message: "Eliminare questa subnet e tutti i suoi IP? L'operazione è irreversibile.",
      onConfirm: async () => {
        setConfirmModal(null);
        try {
          await api.deleteSubnet(id);
          setSubnets((prev) => prev.filter((s) => s.id !== id));
          setEntries((prev) => { const n = { ...prev }; delete n[id]; return n; });
          if (selected?.id === id) setSelected(null);
          showToast("Subnet eliminata", "warning");
        } catch (e) { showToast(e.message, "error"); }
      },
      onCancel: () => setConfirmModal(null),
    });
  };

  // ── Entry CRUD ──
  const openAddEntry = () => { setEntryForm(emptyEntry); setErrors({}); setEditTarget(null); setModal("entry"); };
  const openEditEntry = (e) => { setEntryForm({ ip: e.ip, hostname: e.hostname, mac: e.mac || "", type: e.type, description: e.description || "", tags: (e.tags || []).join(", ") }); setErrors({}); setEditTarget(e); setModal("entry"); };

  const saveEntry = async () => {
    const errs = {};
    if (!entryForm.ip.trim()) errs.ip = "IP obbligatorio";
    else if (!isIPInSubnet(entryForm.ip, selected.cidr)) errs.ip = `IP non appartiene alla subnet ${selected.cidr}`;
    if (!entryForm.hostname.trim()) errs.hostname = "Hostname obbligatorio";
    if (Object.keys(errs).length) { setErrors(errs); return; }
    const payload = { ...entryForm, tags: entryForm.tags.split(",").map((t) => t.trim()).filter(Boolean) };
    try {
      if (editTarget) await api.updateEntry(selected.id, editTarget.id, payload);
      else await api.createEntry(selected.id, payload);
      await loadEntries(selected.id);
      setModal(null);
      showToast(editTarget ? "IP aggiornato" : "IP assegnato");
    } catch (e) { showToast(e.message, "error"); }
  };

  const deleteEntry = (id) => {
    setConfirmModal({
      title: "Rimuovi IP",
      message: "Rimuovere questo indirizzo IP dalla subnet?",
      onConfirm: async () => {
        setConfirmModal(null);
        try {
          await api.deleteEntry(selected.id, id);
          await loadEntries(selected.id);
          showToast("IP rimosso", "warning");
        } catch (e) { showToast(e.message, "error"); }
      },
      onCancel: () => setConfirmModal(null),
    });
  };

  const bulkDeleteEntries = (ids) => {
    setConfirmModal({
      title: "Elimina IP selezionati",
      message: `Eliminare ${ids.length} indirizzi IP? L'operazione è irreversibile.`,
      onConfirm: async () => {
        setConfirmModal(null);
        try {
          await Promise.all(ids.map((id) => api.deleteEntry(selected.id, id)));
          await loadEntries(selected.id);
          showToast(`${ids.length} IP eliminati`, "warning");
        } catch (e) { showToast(e.message, "error"); }
      },
      onCancel: () => setConfirmModal(null),
    });
  };

  const filteredSubnets = subnets.filter((s) => !search || s.name.toLowerCase().includes(search.toLowerCase()) || s.cidr.includes(search) || (s.vlan && s.vlan.toString().includes(search)));
  const subnetEntries = selected ? (entries[selected.id] || []) : [];
  const info = selected ? cidrToInfo(selected.cidr) : null;

  // Capacity warning (only shown once entries are loaded)
  const capacityPct = info && info.total > 0 && entries[selected?.id] ? Math.round((subnetEntries.length / info.total) * 100) : 0;
  const capacityWarning = capacityPct >= 90 ? { color: "#ef4444", msg: `Attenzione: subnet al ${capacityPct}% della capacità!` }
    : capacityPct >= 80 ? { color: "#f97316", msg: `Avviso: subnet al ${capacityPct}% della capacità` }
    : null;

  return (
    <div style={{ padding: 24, display: "flex", gap: 24 }}>
      {/* Left panel */}
      <div style={{ width: selected ? 360 : "100%", flexShrink: 0, transition: "width 0.3s" }}>
        <PageHeader title="Subnet" subtitle={`${subnets.length} subnet`}
          action={<Button onClick={openAddSubnet}><Icon d="M12 5v14M5 12h14" size={14} /> Nuova Subnet</Button>} />
        <div style={{ position: "relative", marginBottom: 16 }}>
          <div style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--text-ghost)" }}><Icon d="M21 21l-6-6m2-5a7 7 0 1 1-14 0 7 7 0 0 1 14 0z" size={14} /></div>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cerca subnet, CIDR, VLAN..." style={{ ...inputStyle, paddingLeft: 32 }} />
        </div>
        {loading ? (
          <div style={{ textAlign: "center", padding: 48, color: "var(--text-ghost)", fontSize: 13 }}>Caricamento...</div>
        ) : filteredSubnets.length === 0 ? (
          <EmptyState icon={<Icon d="M9 3H5a2 2 0 0 0-2 2v4m6-6h10a2 2 0 0 0 2 2v4M9 3v18m0 0h10a2 2 0 0 0 2-2V9M9 21H5a2 2 0 0 0-2-2V9m0 0h18" size={32} />} title={subnets.length === 0 ? "Nessuna subnet" : "Nessun risultato"} subtitle={subnets.length === 0 ? "Crea la tua prima subnet" : ""} />
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: selected ? "1fr" : "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
            {filteredSubnets.map((s) => (
              <SubnetCard key={s.id} subnet={s} used={(entries[s.id] || []).length} total={cidrToInfo(s.cidr)?.total || 0}
                onSelect={handleSelect}
                onEdit={openEditSubnet} onDelete={deleteSubnet} />
            ))}
          </div>
        )}
      </div>

      {/* Right panel: detail */}
      {selected && info && (
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Capacity warning banner */}
          {capacityWarning && (
            <div style={{ background: `${capacityWarning.color}15`, border: `1px solid ${capacityWarning.color}44`, borderRadius: 8, padding: "8px 14px", marginBottom: 12, fontSize: 12, color: capacityWarning.color, display: "flex", alignItems: "center", gap: 8 }}>
              <Icon d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zM12 9v4M12 17h.01" size={14} />
              {capacityWarning.msg}
            </div>
          )}

          <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)", borderRadius: 12, padding: "16px 20px", marginBottom: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                  <span style={{ fontSize: 18, fontWeight: 700, color: "var(--text-primary)" }}>{selected.cidr}</span>
                  {selected.vlan && <Badge color="var(--accent)">VLAN {selected.vlan}</Badge>}
                </div>
                <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{selected.name}{selected.location ? ` · ${selected.location}` : ""}</div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <Button variant="ghost" onClick={() => setDetailView(detailView === "table" ? "grid" : "table")}>
                  <Icon d={detailView === "table" ? "M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z" : "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"} size={13} />
                  {detailView === "table" ? "Mappa" : "Tabella"}
                </Button>
                {subnetEntries.length > 0 && (
                  <Button variant="ghost" onClick={() => exportCSV(subnetEntries, selected)}>
                    <Icon d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" size={13} /> CSV
                  </Button>
                )}
                <Button onClick={openAddEntry}><Icon d="M12 5v14M5 12h14" size={14} /> Assegna IP</Button>
                <Button variant="ghost" onClick={() => setSelected(null)}><Icon d="M18 6L6 18M6 6l12 12" size={14} /></Button>
              </div>
            </div>
            <SaturationBar used={subnetEntries.length} total={info.total} />
            <div style={{ display: "flex", gap: 20, marginTop: 10, fontSize: 11, color: "var(--text-faint)", flexWrap: "wrap" }}>
              <span>Network: <b style={{ color: "var(--text-secondary)", fontWeight: 400 }}>{info.networkAddr}</b></span>
              <span>Broadcast: <b style={{ color: "var(--text-secondary)", fontWeight: 400 }}>{info.broadcastAddr}</b></span>
              <span>Host totali: <b style={{ color: "var(--text-secondary)", fontWeight: 400 }}>{info.total}</b></span>
              <span>Liberi: <b style={{ color: "#22c55e", fontWeight: 400 }}>{info.total - subnetEntries.length}</b></span>
            </div>
          </div>

          {detailView === "grid" ? (
            <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)", borderRadius: 12, padding: 20 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-ghost)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 10 }}>Mappa IP</div>
              <IPGrid cidr={selected.cidr} usedIPs={subnetEntries} />
            </div>
          ) : (
            <ResizableTable entries={subnetEntries} onEdit={openEditEntry} onDelete={deleteEntry} onBulkDelete={bulkDeleteEntries} />
          )}
        </div>
      )}

      {/* Subnet modal */}
      {modal === "subnet" && (
        <Modal title={editTarget ? "Modifica Subnet" : "Nuova Subnet"} onClose={() => setModal(null)}>
          <FormField label="Nome" error={errors.name}><input style={inputStyle} value={subnetForm.name} onChange={(e) => setSubnetForm({ ...subnetForm, name: e.target.value })} placeholder="es. LAN Produzione" /></FormField>
          <FormField label="CIDR" error={errors.cidr}><input style={inputStyle} value={subnetForm.cidr} onChange={(e) => setSubnetForm({ ...subnetForm, cidr: e.target.value })} placeholder="es. 192.168.10.0/24" /></FormField>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <FormField label="VLAN ID"><input style={inputStyle} value={subnetForm.vlan} onChange={(e) => setSubnetForm({ ...subnetForm, vlan: e.target.value })} placeholder="es. 100" /></FormField>
            <FormField label="Location"><input style={inputStyle} value={subnetForm.location} onChange={(e) => setSubnetForm({ ...subnetForm, location: e.target.value })} placeholder="es. Rack A" /></FormField>
          </div>
          <FormField label="Descrizione"><textarea style={{ ...inputStyle, resize: "vertical", minHeight: 60 }} value={subnetForm.description} onChange={(e) => setSubnetForm({ ...subnetForm, description: e.target.value })} /></FormField>
          {subnetForm.cidr && cidrToInfo(subnetForm.cidr) && (() => { const i = cidrToInfo(subnetForm.cidr); return <div style={{ background: "var(--bg-overlay)", borderRadius: 8, padding: "8px 12px", marginBottom: 16, fontSize: 12, color: "var(--text-muted)", display: "flex", gap: 16 }}><span>Host: <b style={{ color: "var(--text-secondary)" }}>{i.total}</b></span><span>Net: <b style={{ color: "var(--text-secondary)" }}>{i.networkAddr}</b></span><span>Broadcast: <b style={{ color: "var(--text-secondary)" }}>{i.broadcastAddr}</b></span></div>; })()}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <Button variant="ghost" onClick={() => setModal(null)}>Annulla</Button>
            <Button onClick={saveSubnet}><Icon d="M20 6L9 17l-5-5" size={14} /> {editTarget ? "Salva" : "Crea"}</Button>
          </div>
        </Modal>
      )}

      {/* Entry modal */}
      {modal === "entry" && (
        <Modal title={editTarget ? "Modifica IP" : `Assegna IP — ${selected?.cidr}`} onClose={() => setModal(null)}>
          <FormField label="Indirizzo IP" error={errors.ip}><input style={inputStyle} value={entryForm.ip} onChange={(e) => setEntryForm({ ...entryForm, ip: e.target.value })} placeholder="es. 192.168.1.10" /></FormField>
          <FormField label="Hostname" error={errors.hostname}><input style={inputStyle} value={entryForm.hostname} onChange={(e) => setEntryForm({ ...entryForm, hostname: e.target.value })} placeholder="es. srv-prod-01" /></FormField>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <FormField label="MAC Address"><input style={inputStyle} value={entryForm.mac} onChange={(e) => setEntryForm({ ...entryForm, mac: e.target.value })} placeholder="AA:BB:CC:DD:EE:FF" /></FormField>
            <FormField label="Tipo">
              <select style={inputStyle} value={entryForm.type} onChange={(e) => setEntryForm({ ...entryForm, type: e.target.value })}>
                {Object.keys(TYPE_COLORS).map((t) => <option key={t}>{t}</option>)}
              </select>
            </FormField>
          </div>
          <FormField label="Tags"><input style={inputStyle} value={entryForm.tags} onChange={(e) => setEntryForm({ ...entryForm, tags: e.target.value })} placeholder="prod, web, dmz" /></FormField>
          <FormField label="Descrizione"><textarea style={{ ...inputStyle, resize: "vertical", minHeight: 60 }} value={entryForm.description} onChange={(e) => setEntryForm({ ...entryForm, description: e.target.value })} /></FormField>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <Button variant="ghost" onClick={() => setModal(null)}>Annulla</Button>
            <Button onClick={saveEntry}><Icon d="M20 6L9 17l-5-5" size={14} /> {editTarget ? "Salva" : "Assegna"}</Button>
          </div>
        </Modal>
      )}

      {/* Confirm modal (replaces browser confirm()) */}
      {confirmModal && (
        <ConfirmModal
          title={confirmModal.title}
          message={confirmModal.message}
          onConfirm={confirmModal.onConfirm}
          onCancel={confirmModal.onCancel}
        />
      )}

      {toast && <Toast {...toast} />}
    </div>
  );
}
