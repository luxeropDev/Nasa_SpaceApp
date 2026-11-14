import { BookOpen, Database, FileText, FlaskConical, GitCompareArrows, Info, LayoutDashboard, Network, Orbit, ShieldAlert, Sparkles, Telescope } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { View } from "../../nav";

export const ICONS: Record<View, LucideIcon> = {
  overview: LayoutDashboard, explorer: Telescope, compare: GitCompareArrows, assistant: Sparkles,
  intel: ShieldAlert, graph: Network, scenarios: Orbit, reports: FileText, sources: Database, datasets: FlaskConical,
};

/** One navigation entry: an in-app route, an external page served by the backend, or an in-app action. */
export type NavItem =
  | { kind: "view"; view: View }
  | { kind: "docs"; href: string; icon: LucideIcon }
  | { kind: "about"; icon: LucideIcon };

export type NavGroup = { key: "nav.g.research" | "nav.g.intelligence" | "nav.g.resources"; items: NavItem[] };

/**
 * Top-navigation information architecture. Every entry maps to something that exists:
 * routes in nav.ts, the FastAPI OpenAPI docs (/docs), or the About dialog.
 */
export const GROUPS: NavGroup[] = [
  { key: "nav.g.research", items: [{ kind: "view", view: "explorer" }, { kind: "view", view: "datasets" }, { kind: "view", view: "compare" }] },
  { key: "nav.g.intelligence", items: [{ kind: "view", view: "assistant" }, { kind: "view", view: "intel" }, { kind: "view", view: "graph" }, { kind: "view", view: "scenarios" }] },
  { key: "nav.g.resources", items: [{ kind: "view", view: "reports" }, { kind: "view", view: "sources" }, { kind: "docs", href: "/docs", icon: BookOpen }, { kind: "about", icon: Info }] },
];

export const groupOf = (v: View): NavGroup | undefined => GROUPS.find((g) => g.items.some((i) => i.kind === "view" && i.view === v));
