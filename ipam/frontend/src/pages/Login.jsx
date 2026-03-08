import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth.jsx";
import { inputStyle, Icon } from "../components/UI";

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
      {/* Background grid */}
      <div style={{ position: "fixed", inset: 0, backgroundImage: "linear-gradient(var(--border-subtle) 1px, transparent 1px), linear-gradient(90deg, var(--border-subtle) 1px, transparent 1px)", backgroundSize: "40px 40px", opacity: 0.6 }} />

      <div style={{ position: "relative", width: 380, background: "var(--bg-surface)", border: "1px solid var(--border-default)", borderRadius: 16, padding: 32, boxShadow: "var(--shadow-modal)" }}>
        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ width: 48, height: 48, background: "linear-gradient(135deg, #3b82f6, #8b5cf6)", borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 12px" }}>
            <Icon d="M9 3H5a2 2 0 0 0-2 2v4m6-6h10a2 2 0 0 0 2 2v4M9 3v18m0 0h10a2 2 0 0 0 2-2V9M9 21H5a2 2 0 0 0-2-2V9m0 0h18" size={22} />
          </div>
          <div style={{ fontSize: 20, fontWeight: 700, color: "var(--text-primary)" }}>IPAM</div>
          <div style={{ fontSize: 11, color: "var(--text-ghost)", letterSpacing: "0.15em", marginTop: 2 }}>LAB NETWORK MANAGER</div>
        </div>

        {error && (
          <div style={{ background: "#ef444411", border: "1px solid #ef444433", borderRadius: 8, padding: "10px 14px", marginBottom: 20, fontSize: 13, color: "#ef4444" }}>
            {error}
          </div>
        )}

        <div style={{ marginBottom: 16 }}>
          <label style={{ display: "block", fontSize: 11, color: "var(--text-muted)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>Username</label>
          <input style={inputStyle} value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })}
            onKeyDown={(e) => e.key === "Enter" && handleSubmit()} autoComplete="username" />
        </div>

        <div style={{ marginBottom: 24 }}>
          <label style={{ display: "block", fontSize: 11, color: "var(--text-muted)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>Password</label>
          <input type="password" style={inputStyle} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })}
            onKeyDown={(e) => e.key === "Enter" && handleSubmit()} autoComplete="current-password" />
        </div>

        <button onClick={handleSubmit} disabled={loading}
          style={{ width: "100%", background: loading ? "var(--accent-bg)" : "var(--accent)", border: "none", color: "white", padding: "10px 0", borderRadius: 8, fontSize: 14, fontWeight: 600, fontFamily: "inherit", cursor: loading ? "not-allowed" : "pointer", transition: "all 0.2s" }}>
          {loading ? "Accesso in corso..." : "Accedi"}
        </button>
      </div>
    </div>
  );
}
