import { useState, useEffect, useRef, useCallback } from "react";
import { api } from "../lib/api";
import { Icon, Modal, FormField, Button, Badge, PageHeader, EmptyState, inputStyle, Toast, ConfirmModal } from "../components/UI";
import { formatDate } from "../lib/utils";

const STATUS_COLORS = { pending: "var(--text-muted)", running: "#10b981", done: "#22c55e", error: "#ef4444", aborted: "#f97316" };
const SCAN_TYPES = [
  { value: "ping", label: "Ping Sweep", desc: "Solo host discovery, veloce" },
  { value: "ports", label: "Port Scan", desc: "Discovery + top 100 porte" },
  { value: "full", label: "Full Scan", desc: "Porte + servizi + OS detection (lento)" },
];

export default function Scanner() {
  const [scans, setScans] = useState([]);
  const [subnets, setSubnets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [importing, setImporting] = useState({ subnet_id: "", hosts: [] });
  const [importLoading, setImportLoading] = useState(false);
  const [abortingIds, setAbortingIds] = useState(new Set());
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [modal, setModal] = useState(null); // "new" | "result" | "import"
  const [selectedScan, setSelectedScan] = useState(null);
  const [form, setForm] = useState({ target: "", subnet_id: "", scan_type: "ping" });
  const [toast, setToast] = useState(null);
  const pollRef = useRef(null);

  const showToast = (msg, type = "success") => { setToast({ msg, type }); setTimeout(() => setToast(null), 3000); };

  const loadScans = useCallback(async () => {
    try { setScans(await api.getScans()); }
    catch (e) { showToast(e.message, "error"); }
  }, []);

  useEffect(() => {
    Promise.all([api.getScans(), api.getSubnets()]).then(([s, sn]) => {
      setScans(s); setSubnets(sn); setLoading(false);
    }).catch((e) => { showToast(e.message, "error"); setLoading(false); });
  }, []);

  // Poll running scans
  useEffect(() => {
    const running = scans.some((s) => s.status === "running");
    if (running) {
      if (!pollRef.current) {
        pollRef.current = setInterval(loadScans, 3000);
      }
    } else {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    }
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [scans, loadScans]);

  const startScan = async () => {
    if (!form.target.trim()) { showToast("Inserisci un target", "error"); return; }
    setStarting(true);
    try {
      await api.startScan({ target: form.target, subnet_id: form.subnet_id || undefined, scan_type: form.scan_type });
      setModal(null);
      await loadScans();
      showToast("Scan avviato!");
    } catch (e) { showToast(e.message, "error"); }
    finally { setStarting(false); }
  };

  const abort = async (id) => {
    setAbortingIds((prev) => new Set(prev).add(id));
    try { await api.abortScan(id); await loadScans(); showToast("Scan interrotto", "warning"); }
    catch (e) { showToast(e.message, "error"); }
    finally { setAbortingIds((prev) => { const s = new Set(prev); s.delete(id); return s; }); }
  };

  const deleteScan = async (id) => {
    try {
      await api.deleteScan(id);
      setScans((prev) => prev.filter((s) => s.id !== id));
      showToast("Scansione eliminata");
    } catch (e) { showToast(e.message, "error"); }
    finally { setConfirmDeleteId(null); }
  };

  const openResult = async (scan) => {
    try {
      const target = scan.result ? scan : await api.getScan(scan.id);
      setSelectedScan(target);
      setModal("result");
    } catch (e) { showToast(e.message, "error"); }
  };

  const openImport = (scan) => {
    setSelectedScan(scan);
    const hosts = scan.result?.hosts || [];
    setImporting({ subnet_id: scan.subnet_id || "", hosts: hosts.map((h) => ({ ...h, _selected: true })) });
    setModal("import");
  };

  const doImport = async () => {
    const selected = importing.hosts.filter((h) => h._selected);
    if (!importing.subnet_id) { showToast("Seleziona una subnet", "error"); return; }
    if (!selected.length) { showToast("Seleziona almeno un host", "error"); return; }
    setImportLoading(true);
    try {
      const res = await api.importHosts(selectedScan.id, importing.subnet_id, selected);
      showToast(`Importati ${res.imported} host (${res.skipped} già presenti)`);
      setModal(null);
    } catch (e) { showToast(e.message, "error"); }
    finally { setImportLoading(false); }
  };

  return (
    <div style={{ padding: 24 }}>
      <PageHeader title="Scanner di rete" subtitle="Scansiona subnet e importa gli host nell'IPAM"
        action={<Button onClick={() => setModal("new")}><Icon d="M9 17H7A5 5 0 0 1 7 7h2M15 7h2a5 5 0 1 1 0 10h-2M8 12h8" size={14} /> Nuova Scansione</Button>} />

      {loading ? (
        <div style={{ textAlign: "center", padding: 48, color: "var(--text-ghost)", fontSize: 13 }}>Caricamento...</div>
      ) : scans.length === 0 ? (
        <EmptyState icon={<Icon d="M9 17H7A5 5 0 0 1 7 7h2M15 7h2a5 5 0 1 1 0 10h-2M8 12h8" size={32} />} title="Nessuna scansione eseguita" subtitle="Avvia una scansione per scoprire i device nella tua rete" />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {scans.map((scan) => (
            <div key={scan.id} style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)", borderRadius: 12, padding: "14px 18px", display: "flex", alignItems: "center", gap: 16 }}>
              {/* Status indicator */}
              <div style={{ width: 10, height: 10, borderRadius: "50%", background: STATUS_COLORS[scan.status] || "#64748b", boxShadow: scan.status === "running" ? `0 0 8px ${STATUS_COLORS.running}` : "none", flexShrink: 0 }} />

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 3 }}>
                  <span style={{ fontFamily: "monospace", fontSize: 14, color: "var(--text-primary)" }}>{scan.target}</span>
                  <Badge color={STATUS_COLORS[scan.status]}>{scan.status}</Badge>
                  {scan.subnet_name && <Badge color="#475569">{scan.subnet_name}</Badge>}
                </div>
                <div style={{ fontSize: 11, color: "var(--text-ghost)", display: "flex", gap: 16 }}>
                  <span>Avviata: {formatDate(scan.started_at)}</span>
                  {scan.finished_at && <span>Terminata: {formatDate(scan.finished_at)}</span>}
                  {scan.result?.hosts && <span style={{ color: "#22c55e" }}>{scan.result.hosts.length} host trovati</span>}
                </div>
              </div>

              <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                {scan.status === "running" && (
                  <Button variant="danger" onClick={() => abort(scan.id)} disabled={abortingIds.has(scan.id)}>
                    <Icon d="M18 6L6 18M6 6l12 12" size={13} /> {abortingIds.has(scan.id) ? "..." : "Abort"}
                  </Button>
                )}
                {scan.status === "done" && scan.result?.hosts?.length > 0 && (
                  <>
                    <Button variant="ghost" onClick={() => openResult(scan)}>
                      <Icon d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z" size={13} /> Risultati
                    </Button>
                    <Button onClick={() => openImport(scan)}>
                      <Icon d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" size={13} /> Importa
                    </Button>
                  </>
                )}
                {(scan.status === "error" || scan.status === "done") && !scan.result?.hosts?.length && (
                  <Button variant="ghost" onClick={() => openResult(scan)}>
                    <Icon d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z" size={13} /> Log
                  </Button>
                )}
                {scan.status !== "running" && (
                  <Button variant="danger" onClick={() => setConfirmDeleteId(scan.id)}>
                    <Icon d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" size={13} />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* New scan modal */}
      {modal === "new" && (
        <Modal title="Nuova Scansione" onClose={() => setModal(null)}>
          <FormField label="Target (CIDR o IP)">
            <input style={inputStyle} value={form.target} onChange={(e) => setForm({ ...form, target: e.target.value })}
              placeholder="es. 192.168.1.0/24 oppure 192.168.1.10" />
            <div style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 4 }}>Accetta notazione CIDR, singolo IP o range (192.168.1.1-254)</div>
          </FormField>

          <FormField label="Subnet IPAM (opzionale)">
            <select style={inputStyle} value={form.subnet_id} onChange={(e) => setForm({ ...form, subnet_id: e.target.value, target: e.target.value ? subnets.find(s => s.id === e.target.value)?.cidr || form.target : form.target })}>
              <option value="">— Nessuna associazione —</option>
              {subnets.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.cidr})</option>)}
            </select>
            <div style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 4 }}>Selezionando una subnet, il CIDR viene auto-compilato nel target</div>
          </FormField>

          <FormField label="Tipo di scansione">
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {SCAN_TYPES.map((st) => (
                <label key={st.value} style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer", padding: "10px 12px", borderRadius: 8, border: `1px solid ${form.scan_type === st.value ? "var(--accent)" : "var(--bg-overlay)"}`, background: form.scan_type === st.value ? "var(--accent-bg)" : "transparent", transition: "all 0.15s" }}>
                  <input type="radio" value={st.value} checked={form.scan_type === st.value} onChange={(e) => setForm({ ...form, scan_type: e.target.value })} style={{ marginTop: 2 }} />
                  <div>
                    <div style={{ fontSize: 13, color: "var(--text-primary)", fontWeight: 500 }}>{st.label}</div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{st.desc}</div>
                  </div>
                </label>
              ))}
            </div>
          </FormField>

          <div style={{ background: "var(--bg-overlay)", borderRadius: 8, padding: "10px 12px", marginBottom: 16, fontSize: 11, color: "var(--text-muted)" }}>
            <Icon d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zM12 9v4M12 17h.01" size={12} style={{ marginRight: 6 }} />
            Il container deve avere NET_ADMIN e NET_RAW capabilities e accesso alla rete target.
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <Button variant="ghost" onClick={() => setModal(null)} disabled={starting}>Annulla</Button>
            <Button onClick={startScan} disabled={starting}>
              <Icon d="M9 17H7A5 5 0 0 1 7 7h2M15 7h2a5 5 0 1 1 0 10h-2M8 12h8" size={14} /> {starting ? "Avvio..." : "Avvia Scansione"}
            </Button>
          </div>
        </Modal>
      )}

      {/* Result modal */}
      {modal === "result" && selectedScan && (
        <Modal title={`Risultati — ${selectedScan.target}`} onClose={() => setModal(null)} width={640}>
          {selectedScan.result?.hosts?.length > 0 ? (
            <div>
              <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 12 }}>{selectedScan.result.hosts.length} host trovati</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 400, overflowY: "auto" }}>
                {selectedScan.result.hosts.map((h) => (
                  <div key={h.ip} style={{ background: "var(--bg-overlay)", borderRadius: 8, padding: "10px 14px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <span style={{ fontFamily: "monospace", fontSize: 14, color: "var(--accent)" }}>{h.ip}</span>
                      {h.mac && <span style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "monospace" }}>{h.mac}{h.vendor ? ` (${h.vendor})` : ""}</span>}
                    </div>
                    {h.hostname && <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>{h.hostname}</div>}
                    {h.os && <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>OS: {h.os}</div>}
                    {h.ports?.length > 0 && (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 6 }}>
                        {h.ports.map((p) => <Badge key={p.port} color={p.state === "open" ? "#22c55e" : "var(--text-muted)"}>{p.port}/{p.proto} {p.service}</Badge>)}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div>
              <div style={{ marginBottom: 12, fontSize: 12, color: "#ef4444" }}>{selectedScan.status === "error" ? "Scansione fallita" : "Nessun host trovato"}</div>
              {selectedScan.result?.raw && (
                <pre style={{ background: "var(--bg-overlay)", borderRadius: 8, padding: 12, fontSize: 11, color: "var(--text-muted)", overflow: "auto", maxHeight: 300 }}>{selectedScan.result.raw || selectedScan.result.stderr}</pre>
              )}
            </div>
          )}
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
            <Button variant="ghost" onClick={() => setModal(null)}>Chiudi</Button>
          </div>
        </Modal>
      )}

      {/* Import modal */}
      {modal === "import" && selectedScan && (
        <Modal title="Importa host nell'IPAM" onClose={() => setModal(null)} width={560}>
          <FormField label="Subnet di destinazione">
            <select style={inputStyle} value={importing.subnet_id} onChange={(e) => setImporting({ ...importing, subnet_id: e.target.value })}>
              <option value="">— Seleziona subnet —</option>
              {subnets.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.cidr})</option>)}
            </select>
          </FormField>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 10 }}>
            Seleziona gli host da importare ({importing.hosts.filter(h => h._selected).length} selezionati):
          </div>
          <div style={{ maxHeight: 300, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
            {importing.hosts.map((h) => (
              <label key={h.ip} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", background: h._selected ? "var(--accent-bg)" : "var(--bg-overlay)", borderRadius: 8, cursor: "pointer", border: `1px solid ${h._selected ? "var(--accent)" : "transparent"}` }}>
                <input type="checkbox" checked={h._selected} onChange={(e) => {
                  setImporting((prev) => ({ ...prev, hosts: prev.hosts.map((x) => x.ip === h.ip ? { ...x, _selected: e.target.checked } : x) }));
                }} />
                <span style={{ fontFamily: "monospace", fontSize: 13, color: "var(--accent)" }}>{h.ip}</span>
                {h.hostname && <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>{h.hostname}</span>}
                {h.mac && <span style={{ fontSize: 11, color: "var(--text-faint)", marginLeft: "auto" }}>{h.mac}</span>}
              </label>
            ))}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 16 }}>
            <button onClick={() => setImporting({ ...importing, hosts: importing.hosts.map(h => ({ ...h, _selected: true })) })} style={{ background: "none", border: "none", color: "var(--accent)", cursor: "pointer", fontSize: 12, fontFamily: "inherit" }}>Seleziona tutti</button>
            <div style={{ display: "flex", gap: 8 }}>
              <Button variant="ghost" onClick={() => setModal(null)} disabled={importLoading}>Annulla</Button>
              <Button onClick={doImport} disabled={importLoading}>
                <Icon d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" size={14} /> {importLoading ? "Importazione..." : "Importa"}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {confirmDeleteId && (
        <ConfirmModal
          title="Elimina scansione"
          message="Sei sicuro di voler eliminare questa scansione? L'operazione non è reversibile."
          onConfirm={() => deleteScan(confirmDeleteId)}
          onCancel={() => setConfirmDeleteId(null)}
          danger
        />
      )}

      {toast && <Toast {...toast} />}
    </div>
  );
}
