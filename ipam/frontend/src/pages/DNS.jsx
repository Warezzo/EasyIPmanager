import { useState, useEffect, useCallback, useMemo } from "react";
import { api } from "../lib/api";
import { Icon, Modal, FormField, Button, Badge, PageHeader, EmptyState, inputStyle, Toast, ConfirmModal } from "../components/UI";

const TYPE_COLORS = { A: "#0ea5e9", AAAA: "#6366f1", CNAME: "#8b5cf6", MX: "#f59e0b", TXT: "#10b981", PTR: "#06b6d4", NS: "#f97316", SRV: "#ec4899", CAA: "var(--text-muted)" };
const DNS_TYPES = ["A", "AAAA", "CNAME", "MX", "TXT", "PTR", "NS", "SRV", "CAA"];

const emptyForm = { zone: "", name: "", type: "A", value: "", ttl: 3600, priority: "", description: "" };

export default function DNS() {
  const [records, setRecords] = useState([]);
  const [zones, setZones] = useState([]);
  const [selectedZone, setSelectedZone] = useState("all");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [modal, setModal] = useState(null);
  const [confirmModal, setConfirmModal] = useState(null);
  const [editTarget, setEditTarget] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState({});
  const [search, setSearch] = useState("");
  const [toast, setToast] = useState(null);

  const showToast = (msg, type = "success") => { setToast({ msg, type }); setTimeout(() => setToast(null), 3000); };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [recs, zns] = await Promise.all([api.getDnsRecords(), api.getDnsZones()]);
      setRecords(recs);
      setZones(zns);
    } catch (e) { showToast(e.message, "error"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openAdd = () => { setForm(emptyForm); setErrors({}); setEditTarget(null); setModal("form"); };
  const openEdit = (r) => { setForm({ zone: r.zone, name: r.name, type: r.type, value: r.value, ttl: r.ttl, priority: r.priority || "", description: r.description || "" }); setErrors({}); setEditTarget(r); setModal("form"); };

  const save = async () => {
    const errs = {};
    if (!form.zone.trim()) errs.zone = "Obbligatorio";
    if (!form.name.trim()) errs.name = "Obbligatorio";
    if (!form.value.trim()) errs.value = "Obbligatorio";
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setSaving(true);
    try {
      const payload = { ...form, ttl: parseInt(form.ttl) || 3600, priority: form.priority ? parseInt(form.priority) : undefined };
      if (editTarget) await api.updateDnsRecord(editTarget.id, payload);
      else await api.createDnsRecord(payload);
      setModal(null);
      await load();
      showToast(editTarget ? "Record aggiornato" : "Record creato");
    } catch (e) { showToast(e.message, "error"); }
    finally { setSaving(false); }
  };

  const del = (id) => {
    setConfirmModal({
      title: "Elimina Record",
      message: "Eliminare questo record DNS?",
      onConfirm: async () => {
        setConfirmModal(null);
        try { await api.deleteDnsRecord(id); await load(); showToast("Record eliminato", "warning"); }
        catch (e) { showToast(e.message, "error"); }
      },
      onCancel: () => setConfirmModal(null),
    });
  };

  const filtered = useMemo(() => records.filter((r) => {
    if (selectedZone !== "all" && r.zone !== selectedZone) return false;
    if (search) return r.name.includes(search) || r.value.includes(search) || r.zone.includes(search);
    return true;
  }), [records, selectedZone, search]);

  const grouped = useMemo(() =>
    filtered.reduce((acc, r) => { (acc[r.zone] = acc[r.zone] || []).push(r); return acc; }, {}),
  [filtered]);

  return (
    <div style={{ padding: 24 }}>
      <PageHeader title="DNS Records" subtitle={`${records.length} record in ${zones.length} zone`}
        action={<Button onClick={openAdd}><Icon d="M12 5v14M5 12h14" size={14} /> Nuovo Record</Button>} />

      {/* Filters */}
      <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
        <div style={{ position: "relative", flex: 1 }}>
          <div style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--text-ghost)" }}><Icon d="M21 21l-6-6m2-5a7 7 0 1 1-14 0 7 7 0 0 1 14 0z" size={14} /></div>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cerca record..." style={{ ...inputStyle, paddingLeft: 32 }} />
        </div>
        <select value={selectedZone} onChange={(e) => setSelectedZone(e.target.value)} style={{ ...inputStyle, width: "auto", paddingRight: 32 }}>
          <option value="all">Tutte le zone</option>
          {zones.map((z) => <option key={z} value={z}>{z}</option>)}
        </select>
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: 48, color: "var(--text-ghost)", fontSize: 13 }}>Caricamento...</div>
      ) : Object.keys(grouped).length === 0 ? (
        <EmptyState icon={<Icon d="M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" size={32} />} title="Nessun record DNS" subtitle="Crea il tuo primo record DNS" />
      ) : (
        Object.entries(grouped).map(([zone, zoneRecords]) => (
          <div key={zone} style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-ghost)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8, display: "flex", alignItems: "center", gap: 8 }}>
              <Icon d="M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" size={12} /> {zone}
              <span style={{ color: "var(--bg-overlay)" }}>({zoneRecords.length})</span>
            </div>
            <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)", borderRadius: 12, overflow: "hidden" }}>
              <div style={{ display: "grid", gridTemplateColumns: "80px 1fr 80px 1fr 60px 80px", gap: 12, padding: "10px 16px", borderBottom: "1px solid var(--border-subtle)", fontSize: 10, color: "var(--text-ghost)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                <span>Type</span><span>Name</span><span>TTL</span><span>Value</span><span>Prio</span><span>Azioni</span>
              </div>
              {[...zoneRecords].sort((a, b) => a.name.localeCompare(b.name)).map((r) => (
                <div key={r.id} style={{ display: "grid", gridTemplateColumns: "80px 1fr 80px 1fr 60px 80px", gap: 12, padding: "10px 16px", borderBottom: "1px solid var(--border-subtle)", alignItems: "center", transition: "background 0.1s" }}
                  onMouseEnter={(e) => e.currentTarget.style.background = "var(--bg-raised)"} onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}>
                  <span><Badge color={TYPE_COLORS[r.type] || "#64748b"}>{r.type}</Badge></span>
                  <span style={{ fontFamily: "monospace", fontSize: 13, color: "var(--text-primary)" }}>{r.name}</span>
                  <span style={{ fontSize: 12, color: "var(--text-faint)" }}>{r.ttl}</span>
                  <span style={{ fontFamily: "monospace", fontSize: 12, color: "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.value}</span>
                  <span style={{ fontSize: 12, color: "var(--text-faint)" }}>{r.priority || "—"}</span>
                  <div style={{ display: "flex", gap: 4 }}>
                    <button onClick={() => openEdit(r)} style={{ background: "none", border: "none", color: "var(--text-ghost)", cursor: "pointer", padding: 4, borderRadius: 4 }} onMouseEnter={(e) => e.currentTarget.style.color = "var(--text-secondary)"} onMouseLeave={(e) => e.currentTarget.style.color = "var(--text-ghost)"}><Icon d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" size={14} /></button>
                    <button onClick={() => del(r.id)} style={{ background: "none", border: "none", color: "var(--text-ghost)", cursor: "pointer", padding: 4, borderRadius: 4 }} onMouseEnter={(e) => e.currentTarget.style.color = "#ef4444"} onMouseLeave={(e) => e.currentTarget.style.color = "var(--text-ghost)"}><Icon d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" size={14} /></button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))
      )}

      {modal === "form" && (
        <Modal title={editTarget ? "Modifica Record" : "Nuovo Record DNS"} onClose={() => setModal(null)}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <FormField label="Zone" error={errors.zone}>
              <input style={inputStyle} value={form.zone} onChange={(e) => setForm({ ...form, zone: e.target.value })} placeholder="es. lab.local" list="zones-list" />
              <datalist id="zones-list">{zones.map((z) => <option key={z} value={z} />)}</datalist>
            </FormField>
            <FormField label="Type">
              <select style={inputStyle} value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                {DNS_TYPES.map((t) => <option key={t}>{t}</option>)}
              </select>
            </FormField>
          </div>
          <FormField label="Name" error={errors.name}>
            <input style={inputStyle} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="es. www o @" />
          </FormField>
          <FormField label="Value" error={errors.value}>
            <input style={inputStyle} value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} placeholder={form.type === "A" ? "es. 192.168.1.10" : form.type === "CNAME" ? "es. server.lab.local." : "valore"} />
          </FormField>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <FormField label="TTL (secondi)">
              <input style={inputStyle} type="number" value={form.ttl} onChange={(e) => setForm({ ...form, ttl: e.target.value })} />
            </FormField>
            {(form.type === "MX" || form.type === "SRV") && (
              <FormField label="Priority">
                <input style={inputStyle} type="number" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} placeholder="es. 10" />
              </FormField>
            )}
          </div>
          <FormField label="Note">
            <input style={inputStyle} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Opzionale" />
          </FormField>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <Button variant="ghost" onClick={() => setModal(null)} disabled={saving}>Annulla</Button>
            <Button onClick={save} disabled={saving}>
              <Icon d="M20 6L9 17l-5-5" size={14} /> {saving ? "Salvataggio..." : editTarget ? "Salva" : "Crea"}
            </Button>
          </div>
        </Modal>
      )}

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
