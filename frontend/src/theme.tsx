import { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { ReactNode } from "react";

export type Theme = "light" | "dark";
const STORE = "flamewise.theme";

function initial(): Theme {
  // the inline pre-paint script in index.html applies the saved theme (dark by default)
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

const Ctx = createContext<{ theme: Theme; toggle: () => void; set: (t: Theme) => void } | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(initial);

  const apply = useCallback((t: Theme, animate: boolean) => {
    const root = document.documentElement;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (animate && !reduce) {
      root.classList.add("theme-fade");
      window.setTimeout(() => root.classList.remove("theme-fade"), 420);
    }
    root.classList.toggle("dark", t === "dark");
    root.style.colorScheme = t;
    setTheme(t);
    try { localStorage.setItem(STORE, t); } catch { /* ignore */ }
  }, []);

  const value = useMemo(() => ({ theme, set: (t: Theme) => apply(t, true), toggle: () => apply(theme === "dark" ? "light" : "dark", true) }), [theme, apply]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTheme() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useTheme must be used inside <ThemeProvider>");
  return c;
}

export type ChartTheme = { series: string[]; grid: string; axis: string; tipBg: string; tipBorder: string; text: string; cursor: string; node: Record<string, string>; edge: string; track: string };
// five ordered series: blue, cyan, violet, orange, green — distinguishable in both themes, orange used once
const LIGHT: ChartTheme = {
  series: ["#0369A1", "#0E7490", "#6D28D9", "#C2410C", "#047857"], grid: "#E2E8F0", axis: "#64748B", tipBg: "#FFFFFF", tipBorder: "#E2E8F0", text: "#111827", cursor: "#F1F5F9",
  node: { investigation: "#0369A1", source: "#0E7490", research_domain: "#6D28D9", safety_domain: "#C2410C", fuel: "#047857", scenario: "#A16207" }, edge: "#94A3B8", track: "#E2E8F0",
};
const DARK: ChartTheme = {
  series: ["#36BFFA", "#67E8F9", "#A78BFA", "#FF9B45", "#34D399"], grid: "rgba(148,163,184,.13)", axis: "#7A8AA0", tipBg: "#111827", tipBorder: "rgba(148,163,184,.27)", text: "#F8FAFC", cursor: "rgba(148,163,184,.08)",
  node: { investigation: "#36BFFA", source: "#67E8F9", research_domain: "#A78BFA", safety_domain: "#FF9B45", fuel: "#34D399", scenario: "#FBBF24" }, edge: "#64748B", track: "#172235",
};
export const useChartTheme = (): ChartTheme => (useTheme().theme === "dark" ? DARK : LIGHT);
