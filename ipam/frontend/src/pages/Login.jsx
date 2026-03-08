import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth.jsx";
import { inputStyle, NetworkLogo } from "../components/UI";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ username: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!form.username || !form.password) { setError("Inserisci username e password"); return; }
    setLoading(true);
    setError("");
    try {
      await login(form.username, form.password);
      navigate("/");
    } catch (e) {
      setError(e.message || "Credenziali non valide");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg-base)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'JetBrains Mono', monospace" }}>
      {/* Dot-grid background */}
      <div style={{ position: "fixed", inset: 0, backgroundImage: "radial-gradient(circle, var(--border-default) 1px, transparent 1px)", backgroundSize: "28px 28px", opacity: 0.5 }} />
      {/* Subtle radial glow from center */}
      <div style={{ position: "fixed", inset: 0, background: "radial-gradient(ellipse 60% 50% at 50% 50%, #10b98108 0%, transparent 70%)", pointerEvents: "none" }} />

      <div style={{ position: "relative", width: 400 }}>
        {/* Top accent line */}
        <div style={{ height: 1, background: "linear-gradient(90deg, transparent, #10b981, transparent)", marginBottom: 0, borderRadius: "1px 1px 0 0" }} />

        <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)", borderTop: "none", borderRadius: "0 0 20px 20px", padding: "36px 36px 40px", boxShadow: "0 32px 80px #00000088, 0 0 0 1px var(--border-subtle)" }}>
          {/* Logo */}
          <div style={{ textAlign: "center", marginBottom: 36 }}>
            <div style={{ position: "relative", display: "inline-block", marginBottom: 18 }}>
              {/* Glow halo */}
              <div style={{ position: "absolute", inset: -14, background: "radial-gradient(circle, #10b98120 0%, transparent 70%)", borderRadius: "50%", pointerEvents: "none" }} />
              <NetworkLogo />
            </div>
            <div style={{ fontSize: 22, fontWeight: 700, color: "var(--text-primary)", letterSpacing: "-0.02em" }}>EasyIPmanager</div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 6 }}>
              <div style={{ flex: 1, maxWidth: 48, height: 1, background: "var(--border-default)" }} />
              <div style={{ fontSize: 10, color: "var(--text-ghost)", letterSpacing: "0.18em", textTransform: "uppercase" }}>Network Management</div>
              <div style={{ flex: 1, maxWidth: 48, height: 1, background: "var(--border-default)" }} />
            </div>
          </div>

          {error && (
            <div style={{ background: "#ef444411", border: "1px solid #ef444430", borderRadius: 8, padding: "10px 14px", marginBottom: 20, fontSize: 12, color: "#f87171", display: "flex", alignItems: "center", gap: 8 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
              {error}
            </div>
          )}

          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", fontSize: 10, color: "var(--text-muted)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.08em" }}>Username</label>
            <input style={inputStyle} value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })}
              onKeyDown={(e) => e.key === "Enter" && handleSubmit()} autoComplete="username" />
          </div>

          <div style={{ marginBottom: 28 }}>
            <label style={{ display: "block", fontSize: 10, color: "var(--text-muted)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.08em" }}>Password</label>
            <input type="password" style={inputStyle} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })}
              onKeyDown={(e) => e.key === "Enter" && handleSubmit()} autoComplete="current-password" />
          </div>

          <button onClick={handleSubmit} disabled={loading}
            style={{ width: "100%", background: loading ? "var(--accent-bg)" : "var(--accent)", border: "1px solid " + (loading ? "var(--accent-bg)" : "var(--accent)"), color: loading ? "var(--accent)" : "#fff", padding: "11px 0", borderRadius: 9, fontSize: 13, fontWeight: 600, fontFamily: "inherit", cursor: loading ? "not-allowed" : "pointer", transition: "all 0.15s", letterSpacing: "0.03em" }}>
            {loading ? "Accesso in corso..." : "Accedi"}
          </button>

          <div style={{ marginTop: 24, paddingTop: 20, borderTop: "1px solid var(--border-subtle)", textAlign: "center", fontSize: 10, color: "var(--text-ghost)", letterSpacing: "0.05em" }}>
            v1.1.0 · Self-hosted · SQLite
          </div>
        </div>
      </div>
    </div>
  );
}
