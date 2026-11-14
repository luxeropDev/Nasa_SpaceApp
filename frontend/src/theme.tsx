import { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { DarkZoneCtx } from "./zone";

export type Theme = "light" | "dark";
const STORE = "flamewise.theme";

function initial(): Theme {
  // the inline pre-paint script in index.html applies the saved theme (light by default)
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
// Ordered categorical series: blue, teal, slate-violet, amber, green. Muted, distinguishable in both themes;
// the combustion orange is reserved for safety-domain marks so it keeps meaning.
const LIGHT: ChartTheme = {
  series: ["#105BD8", "#0F7C8C", "#5B4BB7", "#B4500F", "#2F7D4F"], grid: "#E3E7EE", axis: "#687282", tipBg: "#FFFFFF", tipBorder: "#D9DEE7", text: "#172033", cursor: "#F1F3F7",
  node: { investigation: "#0B3D91", source: "#0F7C8C", research_domain: "#5B4BB7", safety_domain: "#B4500F", fuel: "#2F7D4F", scenario: "#8A6A00", dataset: "#105BD8", document: "#6B4E16", context: "#8C2F39" }, edge: "#A8B2C2", track: "#E3E7EE",
};
const DARK: ChartTheme = {
  series: ["#6EA8FE", "#5CC4CF", "#A99BF0", "#E88842", "#6CCB91"], grid: "rgba(166,177,192,.12)", axis: "#8A96A7", tipBg: "#191F29", tipBorder: "#303B4A", text: "#EDF2F7", cursor: "rgba(166,177,192,.08)",
  node: { investigation: "#6EA8FE", source: "#5CC4CF", research_domain: "#A99BF0", safety_domain: "#E88842", fuel: "#6CCB91", scenario: "#E0B04A", dataset: "#9EC5FF", document: "#D9B77A", context: "#E58A93" }, edge: "#5A6678", track: "#202936",
};
/** Chart colors follow the surface they are drawn on: a dark zone forces the dark palette in either theme. */
export const useChartTheme = (forceDark = false): ChartTheme => {
  const zone = useContext(DarkZoneCtx);
  const { theme } = useTheme();
  return forceDark || zone || theme === "dark" ? DARK : LIGHT;
};
