import { Database, FileText, GitCompareArrows, LayoutDashboard, Network, Orbit, ShieldAlert, Sparkles, Telescope } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { View } from "../../nav";

export const ICONS: Record<View, LucideIcon> = {
  overview: LayoutDashboard, explorer: Telescope, compare: GitCompareArrows, assistant: Sparkles,
  intel: ShieldAlert, graph: Network, scenarios: Orbit, reports: FileText, sources: Database,
};

/** Sidebar grouping: research workspace, analysis, output/data. */
export const GROUPS: { key: "nav.g.research" | "nav.g.analysis" | "nav.g.output"; views: View[] }[] = [
  { key: "nav.g.research", views: ["overview", "explorer", "compare", "assistant"] },
  { key: "nav.g.analysis", views: ["intel", "graph", "scenarios"] },
  { key: "nav.g.output", views: ["reports", "sources"] },
];
