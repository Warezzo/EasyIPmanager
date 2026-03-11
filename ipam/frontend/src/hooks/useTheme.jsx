import { useState, useEffect, createContext, useContext } from "react";

// ── Token definitions ─────────────────────────────────────────────────────────

const DARK = {
  "--bg-base":        "#09090b",
  "--bg-surface":     "#111113",
  "--bg-raised":      "#1c1c1f",
  "--bg-overlay":     "#27272a",
  "--bg-input":       "#1c1c1f",
  "--border-subtle":  "#1c1c1f",
  "--border-default": "#27272a",
  "--border-strong":  "#3f3f46",
  "--text-primary":   "#fafafa",
  "--text-secondary": "#a1a1aa",
  "--text-muted":     "#71717a",
  "--text-faint":     "#52525b",
  "--text-ghost":     "#3f3f46",
  "--accent":         "#10b981",
  "--accent-hover":   "#059669",
  "--accent-bg":      "#052e16",
  "--shadow-modal":   "0 25px 60px #00000099",
  "--shadow-toast":   "0 8px 32px #00000077",
};

const LIGHT = {
  "--bg-base":        "#fafafa",
  "--bg-surface":     "#ffffff",
  "--bg-raised":      "#f4f4f5",
  "--bg-overlay":     "#e4e4e7",
  "--bg-input":       "#ffffff",
  "--border-subtle":  "#e4e4e7",
  "--border-default": "#d4d4d8",
  "--border-strong":  "#a1a1aa",
  "--text-primary":   "#09090b",
  "--text-secondary": "#3f3f46",
  "--text-muted":     "#52525b",
  "--text-faint":     "#71717a",
  "--text-ghost":     "#a1a1aa",
  "--accent":         "#059669",
  "--accent-hover":   "#047857",
  "--accent-bg":      "#ecfdf5",
  "--shadow-modal":   "0 25px 60px #00000022",
  "--shadow-toast":   "0 8px 32px #00000018",
};

// ── Helpers (module-level so they're usable in the useState initializer) ──────

function resolveTokens(t) {
  if (t === "system") {
    return window.matchMedia("(prefers-color-scheme: light)").matches ? LIGHT : DARK;
  }
  return t === "light" ? LIGHT : DARK;
}

function applyTokens(tokens) {
  const root = document.documentElement;
  Object.entries(tokens).forEach(([k, v]) => root.style.setProperty(k, v));
}

// ── Context ───────────────────────────────────────────────────────────────────

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  // Apply tokens synchronously before the first paint to prevent FOUC
  const [theme, setThemeState] = useState(() => {
    const t = localStorage.getItem("ipam_theme") || "dark";
    applyTokens(resolveTokens(t));
    return t;
  });

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
