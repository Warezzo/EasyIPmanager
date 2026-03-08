// Shared UI primitives — theme-aware via CSS variables

export const inputStyle = {
  width: "100%",
  background: "var(--bg-input)",
  border: "1px solid var(--border-strong)",
  borderRadius: 8,
  padding: "8px 12px",
  color: "var(--text-primary)",
  fontSize: 13,
  outline: "none",
  boxSizing: "border-box",
  fontFamily: "'JetBrains Mono', monospace",
};

export function Icon({ d, size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}

export function Modal({ title, onClose, children, width = 480 }) {
  return (
    <div onClick={(e) => e.target === e.currentTarget && onClose()}
      style={{ position: "fixed", inset: 0, background: "#00000077", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, backdropFilter: "blur(4px)" }}>
      <div style={{ background: "var(--bg-raised)", border: "1px solid var(--border-default)", borderRadius: 12, padding: 24, width, maxWidth: "95vw", maxHeight: "90vh", overflowY: "auto", boxShadow: "var(--shadow-modal)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: "var(--text-primary)" }}>{title}</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", padding: 4, borderRadius: 6 }}>
            <Icon d="M18 6L6 18M6 6l12 12" size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function FormField({ label, children, error }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ display: "block", fontSize: 11, fontWeight: 500, color: "var(--text-secondary)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>
        {label}
      </label>
      {children}
      {error && <div style={{ fontSize: 12, color: "#ef4444", marginTop: 4 }}>{error}</div>}
    </div>
  );
}

export function Button({ onClick, variant = "primary", children, disabled, style: extra }) {
  const base = {
    cursor: disabled ? "not-allowed" : "pointer", padding: "8px 14px", borderRadius: 8,
    fontSize: 13, fontWeight: 600, fontFamily: "inherit", display: "inline-flex",
    alignItems: "center", gap: 6, transition: "all 0.15s", opacity: disabled ? 0.5 : 1,
    border: "none", ...extra,
  };
  const variants = {
    primary: { background: "var(--accent)", color: "white" },
    ghost:   { background: "transparent", border: "1px solid var(--border-default)", color: "var(--text-muted)" },
    danger:  { background: "#ef444422", border: "1px solid #ef444444", color: "#ef4444" },
  };
  return <button onClick={disabled ? undefined : onClick} style={{ ...base, ...variants[variant] }}>{children}</button>;
}

export function Badge({ children, color = "var(--text-muted)" }) {
  return (
    <span style={{ fontSize: 11, background: `${color}22`, color, border: `1px solid ${color}44`, padding: "2px 8px", borderRadius: 20 }}>
      {children}
    </span>
  );
}

export function SaturationBar({ used, total, showLabel = true }) {
  const pct = total > 0 ? Math.round((used / total) * 100) : 0;
  const color = pct >= 90 ? "#ef4444" : pct >= 70 ? "#f97316" : pct >= 50 ? "#eab308" : "#22c55e";
  return (
    <div style={{ width: "100%" }}>
      <div style={{ height: 8, background: "var(--bg-overlay)", borderRadius: 4, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 4, transition: "width 0.6s cubic-bezier(0.4,0,0.2,1)", boxShadow: `0 0 8px ${color}66` }} />
      </div>
      {showLabel && (
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4, fontSize: 11, color: "var(--text-muted)" }}>
          <span style={{ color }}>{pct}% utilizzato</span>
          <span>{used} / {total} IP</span>
        </div>
      )}
    </div>
  );
}

export function Toast({ msg, type = "success" }) {
  const color = type === "warning" ? "#f97316" : type === "error" ? "#ef4444" : "#22c55e";
  return (
    <div style={{ position: "fixed", bottom: 24, right: 24, background: "var(--bg-raised)", border: `1px solid ${color}44`, color, padding: "10px 16px", borderRadius: 10, fontSize: 13, display: "flex", alignItems: "center", gap: 8, boxShadow: "var(--shadow-toast)", zIndex: 2000 }}>
      {msg}
    </div>
  );
}

export function PageHeader({ title, subtitle, action }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
      <div>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: "var(--text-primary)" }}>{title}</h1>
        {subtitle && <div style={{ fontSize: 13, color: "var(--text-faint)", marginTop: 4 }}>{subtitle}</div>}
      </div>
      {action}
    </div>
  );
}

export function ConfirmModal({ title, message, onConfirm, onCancel, danger = true }) {
  return (
    <Modal title={title} onClose={onCancel} width={380}>
      <div style={{ color: "var(--text-secondary)", fontSize: 14, lineHeight: 1.6, marginBottom: 24 }}>{message}</div>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <Button variant="ghost" onClick={onCancel}>Annulla</Button>
        <Button variant={danger ? "danger" : "primary"} onClick={onConfirm}>Conferma</Button>
      </div>
    </Modal>
  );
}

export function EmptyState({ icon, title, subtitle }) {
  return (
    <div style={{ textAlign: "center", padding: "48px 24px", color: "var(--text-ghost)", border: "1px dashed var(--border-default)", borderRadius: 12 }}>
      <div style={{ marginBottom: 12, opacity: 0.5 }}>{icon}</div>
      <div style={{ fontSize: 14, color: "var(--text-faint)", marginBottom: 4 }}>{title}</div>
      {subtitle && <div style={{ fontSize: 12, color: "var(--text-ghost)" }}>{subtitle}</div>}
    </div>
  );
}
