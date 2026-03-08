import { useState, useEffect, createContext, useContext } from "react";

// ── Token definitions ─────────────────────────────────────────────────────────

const DARK = {
  "--bg-base":        "#020817",
  "--bg-surface":     "#0a0f1e",
  "--bg-raised":      "#0f172a",
  "--bg-overlay":     "#1e293b",
  "--bg-input":       "#1e293b",
  "--border-subtle":  "#0f172a",
  "--border-default": "#1e293b",
  "--border-strong":  "#334155",
  "--text-primary":   "#f1f5f9",
  "--text-secondary": "#94a3b8",
  "--text-muted":     "#64748b",
  "--text-faint":     "#475569",
  "--text-ghost":     "#334155",
  "--accent":         "#3b82f6",
  "--accent-hover":   "#2563eb",
  "--accent-bg":      "#0f2040",
  "--shadow-modal":   "0 25px 60px #00000088",
  "--shadow-toast":   "0 8px 32px #00000066",
};

const LIGHT = {
  "--bg-base":        "#f8fafc",
  "--bg-surface":     "#ffffff",
  "--bg-raised":      "#f1f5f9",
  "--bg-overlay":     "#e2e8f0",
  "--bg-input":       "#f8fafc",
  "--border-subtle":  "#e2e8f0",
  "--border-default": "#cbd5e1",
  "--border-strong":  "#94a3b8",
  "--text-primary":   "#0f172a",
  "--text-secondary": "#334155",
  "--text-muted":     "#475569",
  "--text-faint":     "#64748b",
  "--text-ghost":     "#94a3b8",
  "--accent":         "#2563eb",
  "--accent-hover":   "#1d4ed8",
  "--accent-bg":      "#eff6ff",
  "--shadow-modal":   "0 25px 60px #00000022",
  "--shadow-toast":   "0 8px 32px #00000018",
};

// ── Context ───────────────────────────────────────────────────────────────────

const ThemeContext = createContext(null);

function applyTokens(tokens) {
  const root = document.documentElement;
  Object.entries(tokens).forEach(([k, v]) => root.style.setProperty(k, v));
}

export function ThemeProvider({ children }) {
  // "dark" | "light" | "system"
  const [theme, setThemeState] = useState(() => localStorage.getItem("ipam_theme") || "dark");

  const resolveTokens = (t) => {
    if (t === "system") {
      return window.matchMedia("(prefers-color-scheme: light)").matches ? LIGHT : DARK;
    }
    return t === "light" ? LIGHT : DARK;
  };

  useEffect(() => {
    applyTokens(resolveTokens(theme));

    // If system, listen for OS changes
    if (theme === "system") {
      const mq = window.matchMedia("(prefers-color-scheme: light)");
      const handler = () => applyTokens(resolveTokens("system"));
      mq.addEventListener("change", handler);
      return () => mq.removeEventListener("change", handler);
    }
  }, [theme]);

  const setTheme = (t) => {
    localStorage.setItem("ipam_theme", t);
    setThemeState(t);
  };

  const resolved = theme === "system"
    ? (window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark")
    : theme;

  return (
    <ThemeContext.Provider value={{ theme, setTheme, resolved }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
