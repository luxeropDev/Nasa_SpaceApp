import { createContext, useContext, useEffect } from "react";
import type { ReactNode } from "react";
import { DarkZoneCtx } from "./zone";

export type Theme = "light";
const Ctx = createContext<{ theme: Theme } | null>(null);

/**
 * PyroLens now has one editorial theme: black navigation, white reading surfaces and deliberate dark data zones.
 * Remove the former class/preference so saved settings and OS dark mode can never alter the design.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove("dark", "theme-fade");
    root.style.colorScheme = "light";
    try { localStorage.removeItem("flamewise.theme"); } catch { /* storage may be unavailable */ }
  }, []);
  return <Ctx.Provider value={{ theme: "light" }}>{children}</Ctx.Provider>;
}

export function useTheme() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useTheme must be used inside <ThemeProvider>");
  return c;
}

export type ChartTheme = { series: string[]; grid: string; axis: string; tipBg: string; tipBorder: string; text: string; cursor: string; node: Record<string, string>; edge: string; track: string };
const LIGHT: ChartTheme = {
  series: ["#0050d8", "#007a86", "#5b4bb7", "#c43d2f", "#2f7d4f"], grid: "#d5d8dc", axis: "#565c65", tipBg: "#ffffff", tipBorder: "#c9c9c9", text: "#1b1b1b", cursor: "#f1f1f1",
  node: { investigation: "#0b3d91", source: "#007a86", research_domain: "#5b4bb7", safety_domain: "#c43d2f", fuel: "#2f7d4f", scenario: "#8a6a00", dataset: "#0050d8", document: "#6b4e16", context: "#8c2f39" }, edge: "#8d9297", track: "#e6e6e6",
};
const DARK: ChartTheme = {
  series: ["#75a7ff", "#5cc4cf", "#b5a8ff", "#ff8477", "#71d398"], grid: "rgba(255,255,255,.14)", axis: "#b8bec7", tipBg: "#171717", tipBorder: "#454545", text: "#ffffff", cursor: "rgba(255,255,255,.08)",
  node: { investigation: "#75a7ff", source: "#5cc4cf", research_domain: "#b5a8ff", safety_domain: "#ff8477", fuel: "#71d398", scenario: "#f5c451", dataset: "#a9c8ff", document: "#e0bd80", context: "#ee9ba3" }, edge: "#727983", track: "#292929",
};

/** Charts use the light palette except inside intentional dark editorial/plotting sections. */
export const useChartTheme = (forceDark = false): ChartTheme => {
  const zone = useContext(DarkZoneCtx);
  useTheme();
  return forceDark || zone ? DARK : LIGHT;
};
