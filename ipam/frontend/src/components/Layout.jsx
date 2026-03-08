import { NavLink, useNavigate } from "react-router-dom";
import { useState } from "react";
import { useAuth } from "../hooks/useAuth.jsx";
import { useTheme } from "../hooks/useTheme.jsx";
import { Icon } from "./UI.jsx";

const NAV = [
  { to: "/",        label: "IPAM",    icon: "M9 3H5a2 2 0 0 0-2 2v4m6-6h10a2 2 0 0 0 2 2v4M9 3v18m0 0h10a2 2 0 0 0 2-2V9M9 21H5a2 2 0 0 0-2-2V9m0 0h18" },
  { to: "/dns",     label: "DNS",     icon: "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0zM9 9h.01M15 9h.01M8 13s1.5 2 4 2 4-2 4-2" },
  { to: "/scanner", label: "Scanner", icon: "M9 17H7A5 5 0 0 1 7 7h2M15 7h2a5 5 0 1 1 0 10h-2M8 12h8" },
];

const THEME_OPTIONS = [
  { value: "dark",   label: "Scuro",   icon: "M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" },
  { value: "light",  label: "Chiaro",  icon: "M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42M12 5a7 7 0 1 0 0 14A7 7 0 0 0 12 5z" },
  { value: "system", label: "Sistema", icon: "M2 13.5V19a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-5.5M2 13.5L12 2l10 11.5M2 13.5h20" },
];

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { theme, setTheme } = useTheme();
  const [themeOpen, setThemeOpen] = useState(false);

  const handleLogout = () => { logout(); navigate("/login"); };
  const currentThemeOption = THEME_OPTIONS.find((o) => o.value === theme) || THEME_OPTIONS[0];

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg-base)", color: "var(--text-primary)", fontFamily: "'JetBrains Mono', monospace", display: "flex" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;500;600;700&display=swap');
        * { box-sizing: border-box; }
        input:focus, select:focus, textarea:focus { border-color: var(--accent) !important; outline: none; box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 20%, transparent); }
        select option { background: var(--bg-overlay); color: var(--text-primary); }
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-track { background: var(--bg-base); }
        ::-webkit-scrollbar-thumb { background: var(--bg-overlay); border-radius: 3px; }
        a { text-decoration: none; }
      `}</style>

      {/* Sidebar */}
      <div style={{ width: 200, background: "var(--bg-surface)", borderRight: "1px solid var(--border-subtle)", display: "flex", flexDirection: "column", flexShrink: 0, position: "relative" }}>

        {/* Logo */}
        <div style={{ padding: "20px 16px 16px", borderBottom: "1px solid var(--border-subtle)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 30, height: 30, background: "linear-gradient(135deg, #3b82f6, #8b5cf6)", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <Icon d="M9 3H5a2 2 0 0 0-2 2v4m6-6h10a2 2 0 0 0 2 2v4M9 3v18m0 0h10a2 2 0 0 0 2-2V9M9 21H5a2 2 0 0 0-2-2V9m0 0h18" size={14} />
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>IPAM</div>
              <div style={{ fontSize: 9, color: "var(--text-ghost)", letterSpacing: "0.08em" }}>LAB MANAGER</div>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: "12px 8px" }}>
          {NAV.map(({ to, label, icon }) => (
            <NavLink key={to} to={to} end={to === "/"} style={({ isActive }) => ({
              display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 8,
              color: isActive ? "var(--accent)" : "var(--text-faint)",
              background: isActive ? "var(--bg-raised)" : "transparent",
              fontSize: 13, fontWeight: isActive ? 600 : 400, marginBottom: 2, transition: "all 0.15s",
            })}>
              <Icon d={icon} size={15} />
              {label}
            </NavLink>
          ))}
        </nav>

        {/* Bottom section */}
        <div style={{ padding: "12px 16px", borderTop: "1px solid var(--border-subtle)", display: "flex", flexDirection: "column", gap: 8 }}>

          {/* Theme picker */}
          <div style={{ position: "relative" }}>
            <button
              onClick={() => setThemeOpen((v) => !v)}
              style={{ width: "100%", background: "var(--bg-raised)", border: "1px solid var(--border-default)", color: "var(--text-muted)", cursor: "pointer", padding: "6px 10px", borderRadius: 6, fontSize: 11, fontFamily: "inherit", display: "flex", alignItems: "center", gap: 6, justifyContent: "space-between", transition: "all 0.15s" }}>
              <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <Icon d={currentThemeOption.icon} size={13} />
                {currentThemeOption.label}
              </span>
              <Icon d="M6 9l6 6 6-6" size={12} />
            </button>

            {themeOpen && (
              <>
                {/* backdrop */}
                <div onClick={() => setThemeOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 10 }} />
                <div style={{ position: "absolute", bottom: "calc(100% + 6px)", left: 0, right: 0, background: "var(--bg-raised)", border: "1px solid var(--border-default)", borderRadius: 8, overflow: "hidden", boxShadow: "var(--shadow-modal)", zIndex: 20 }}>
                  {THEME_OPTIONS.map((opt) => (
                    <button key={opt.value} onClick={() => { setTheme(opt.value); setThemeOpen(false); }}
                      style={{ width: "100%", background: theme === opt.value ? "var(--accent-bg)" : "transparent", border: "none", color: theme === opt.value ? "var(--accent)" : "var(--text-faint)", cursor: "pointer", padding: "8px 12px", fontSize: 12, fontFamily: "inherit", display: "flex", alignItems: "center", gap: 8, transition: "all 0.1s", textAlign: "left" }}>
                      <Icon d={opt.icon} size={13} />
                      {opt.label}
                      {theme === opt.value && <span style={{ marginLeft: "auto", color: "var(--accent)" }}>✓</span>}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* User + logout */}
          <div style={{ fontSize: 11, color: "var(--text-ghost)" }}>{user}</div>
          <button onClick={handleLogout}
            style={{ background: "none", border: "1px solid var(--border-default)", color: "var(--text-faint)", cursor: "pointer", padding: "6px 10px", borderRadius: 6, fontSize: 11, fontFamily: "inherit", width: "100%", transition: "all 0.15s" }}
            onMouseEnter={(e) => { e.currentTarget.style.color = "#ef4444"; e.currentTarget.style.borderColor = "#ef444444"; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-faint)"; e.currentTarget.style.borderColor = "var(--border-default)"; }}>
            Logout
          </button>
        </div>
      </div>

      {/* Main */}
      <main style={{ flex: 1, overflowY: "auto", minWidth: 0, background: "var(--bg-base)" }}>
        {children}
      </main>
    </div>
  );
}
