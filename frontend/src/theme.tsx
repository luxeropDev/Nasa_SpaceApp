import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

export type Theme = "light" | "dark";
const STORE = "flamewise.theme";

function initial(): Theme {
  if (document.documentElement.classList.contains("dark")) return "dark"; // set by the inline pre-paint script
  return "light";
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

  // follow OS changes only while the user has not chosen explicitly
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const on = (e: MediaQueryListEvent) => {
      let saved: string | null = null;
      try { saved = localStorage.getItem(STORE); } catch { /* ignore */ }
      if (saved !== "light" && saved !== "dark") {
        document.documentElement.classList.toggle("dark", e.matches);
        setTheme(e.matches ? "dark" : "light");
      }
    };
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

  const value = useMemo(() => ({ theme, set: (t: Theme) => apply(t, true), toggle: () => apply(theme === "dark" ? "light" : "dark", true) }), [theme, apply]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTheme() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useTheme must be used inside <ThemeProvider>");
  return c;
}

export type ChartTheme = { series: string[]; grid: string; axis: string; tipBg: string; tipBorder: string; text: string; cursor: string };
const LIGHT: ChartTheme = { series: ["#0369a1", "#4f46e5", "#0d9488", "#c2410c", "#7c3aed"], grid: "#e0e5ef", axis: "#64748b", tipBg: "#ffffff", tipBorder: "#e0e5ef", text: "#0f172a", cursor: "#f0f3f9" };
const DARK: ChartTheme = { series: ["#38bdf8", "#818cf8", "#2dd4bf", "#fb923c", "#c084fc"], grid: "#283248", axis: "#8795ad", tipBg: "#141a28", tipBorder: "#283248", text: "#e8edf6", cursor: "#1c2436" };
export const useChartTheme = (): ChartTheme => (useTheme().theme === "dark" ? DARK : LIGHT);
