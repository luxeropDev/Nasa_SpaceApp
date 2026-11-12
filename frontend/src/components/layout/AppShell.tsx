import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { ChevronRight, CircleHelp, Menu, Search, X } from "lucide-react";
import type { Health } from "../../api";
import { useI18n } from "../../i18n";
import type { Key } from "../../i18n";
import { href } from "../../nav";
import type { View } from "../../nav";
import { LangSwitch, ThemeSwitch } from "../Switchers";
import CommandSearch from "./CommandSearch";
import Sidebar from "./Sidebar";

type HealthState = { data: Health | null; error: unknown };

/** Data-source / assistant status: shows only what the backend actually reports. */
export function StatusPill({ health, onClick, compact = false }: { health: HealthState; onClick: () => void; compact?: boolean }) {
  const { t } = useI18n();
  const online = !!health.data;
  const live = health.data?.llm_live;
  const label = !online ? (health.error ? t("status.offline") : t("top.checking")) : live ? t("mode.live") : t("mode.demo");
  const dot = !online ? (health.error ? "bg-danger text-danger" : "bg-subtle text-subtle") : live ? "bg-ok text-ok" : "bg-warn text-warn";
  return (
    <button type="button" onClick={onClick} aria-haspopup="dialog" title={`${t("top.system")}: ${label}`}
      className={`inline-flex items-center gap-2 rounded-ctl text-xs font-medium text-muted transition-colors hover:bg-hover hover:text-fg ${compact ? "h-9 w-9 justify-center" : "w-full px-2.5 py-2"}`}>
      <span className={`status-dot h-2 w-2 shrink-0 rounded-full ${dot}`} aria-hidden="true" />
      {compact ? <span className="sr-only">{label}</span> : <span className="min-w-0 truncate text-left">{label}{health.data && <span className="ml-1.5 font-mono text-[10.5px] text-subtle">{health.data.dataset_version}</span>}</span>}
    </button>
  );
}

type Props = { view: View; health: HealthState; onAbout: () => void; children: ReactNode };

export default function AppShell({ view, health, onAbout, children }: Props) {
  const { t } = useI18n();
  const [collapsed, setCollapsed] = useState(() => document.documentElement.dataset.sidebar === "collapsed");
  const [drawer, setDrawer] = useState(false);
  const [search, setSearch] = useState(false);
  const drawerRef = useRef<HTMLDivElement>(null);

  const toggle = useCallback(() => {
    setCollapsed((c) => {
      const n = !c;
      if (n) document.documentElement.dataset.sidebar = "collapsed"; else delete document.documentElement.dataset.sidebar;
      try { localStorage.setItem("flamewise.sidebar", n ? "collapsed" : "expanded"); } catch { /* optional */ }
      return n;
    });
  }, []);

  useEffect(() => { setDrawer(false); }, [view]);
  // global shortcut: Ctrl/⌘+K or "/" opens search
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test((e.target as HTMLElement)?.tagName ?? "") || (e.target as HTMLElement)?.isContentEditable;
      if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) { e.preventDefault(); setSearch(true); }
      else if (e.key === "/" && !typing) { e.preventDefault(); setSearch(true); }
    };
    document.addEventListener("keydown", on);
    return () => document.removeEventListener("keydown", on);
  }, []);
  // mobile drawer: Esc closes, focus moves inside, background scroll locked
  useEffect(() => {
    if (!drawer) return;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    drawerRef.current?.querySelector<HTMLElement>("a,button")?.focus();
    const on = (e: KeyboardEvent) => e.key === "Escape" && setDrawer(false);
    document.addEventListener("keydown", on);
    return () => { document.removeEventListener("keydown", on); document.body.style.overflow = overflow; };
  }, [drawer]);

  return (
    <div className="min-h-screen">
      <a href="#main" onClick={(e) => { e.preventDefault(); document.getElementById("main")?.focus(); }} className="sr-only left-4 top-3 z-[80] rounded-ctl bg-accent px-3 py-2 text-sm text-white focus:not-sr-only focus:fixed">{t("nav.skip")}</a>

      {/* desktop sidebar */}
      <aside className="no-print fixed inset-y-0 left-0 z-40 hidden w-[var(--sb)] border-r border-line bg-bg2 transition-[width] duration-300 ease-out lg:block">
        <Sidebar view={view} collapsed={collapsed} onToggle={toggle} footer={<StatusPill health={health} onClick={onAbout} compact={collapsed} />} />
      </aside>

      {/* mobile drawer */}
      {drawer && (
        <div className="no-print fixed inset-0 z-[55] lg:hidden" role="dialog" aria-modal="true" aria-label={t("nav.main")}>
          <div className="absolute inset-0 bg-[#05070C]/70 backdrop-blur-sm" style={{ animation: "fadeIn .2s ease-out both" }} onClick={() => setDrawer(false)} aria-hidden="true" />
          <div ref={drawerRef} className="absolute inset-y-0 left-0 w-[284px] max-w-[85vw] border-r border-line bg-bg2 shadow-pop" style={{ animation: "drawer-in .28s cubic-bezier(0.16,1,0.3,1) both" }}>
            <button className="icon-btn absolute right-2 top-2.5 z-10" onClick={() => setDrawer(false)} aria-label={t("nav.close")}><X size={18} /></button>
            <Sidebar view={view} collapsed={false} onNavigate={() => setDrawer(false)} footer={<StatusPill health={health} onClick={() => { setDrawer(false); onAbout(); }} />} />
          </div>
        </div>
      )}

      <div className="transition-[padding] duration-300 ease-out lg:pl-[var(--sb)]">
        <header className="no-print sticky top-0 z-30 border-b border-line bg-bg/80 backdrop-blur-xl">
          <div className="flex h-14 items-center gap-2 px-3 sm:px-5 lg:px-6">
            <button className="icon-btn lg:hidden" onClick={() => setDrawer(true)} aria-label={t("nav.menu")} aria-expanded={drawer}><Menu size={19} /></button>
            <nav aria-label={t("nav.breadcrumb")} className="hidden min-w-0 items-center gap-1.5 text-[13px] sm:flex">
              <a href={href("overview")} className="font-mono text-[11px] font-semibold uppercase tracking-[.16em] text-subtle hover:text-fg">Flamewise</a>
              <ChevronRight size={13} className="shrink-0 text-subtle" aria-hidden="true" />
              <span className="truncate font-medium text-fg" aria-current="page">{t(`nav.${view}` as Key)}</span>
            </nav>
            <button type="button" onClick={() => setSearch(true)} aria-haspopup="dialog"
              className="ml-auto flex h-9 min-w-0 items-center gap-2 rounded-btn border border-line bg-surface px-2.5 text-[13px] text-subtle transition-colors hover:border-line-strong hover:text-fg sm:w-64 md:w-72">
              <Search size={15} className="shrink-0" aria-hidden="true" />
              <span className="hidden truncate sm:inline">{t("cmd.open")}</span>
              <span className="sr-only sm:hidden">{t("cmd.open")}</span>
              <span className="kbd ml-auto hidden md:inline">{/Mac|iPhone|iPad/.test(navigator.platform) ? "⌘K" : "Ctrl K"}</span>
            </button>
            <div className="hidden sm:block"><LangSwitch /></div>
            <ThemeSwitch />
            <button className="icon-btn" onClick={onAbout} aria-label={t("about.open")} title={t("about.open")} aria-haspopup="dialog"><CircleHelp size={17} /></button>
          </div>
          <div className="flex items-center justify-between gap-2 border-t border-line px-3 py-1.5 sm:hidden">
            <span className="truncate text-[13px] font-medium text-fg">{t(`nav.${view}` as Key)}</span>
            <LangSwitch />
          </div>
        </header>
        <main id="main" tabIndex={-1} className="outline-none">{children}</main>
        <footer className="no-print mx-auto max-w-[1320px] border-t border-line px-4 py-6 sm:px-6 lg:px-8">
          <p className="text-[11.5px] leading-relaxed text-subtle">{t("footer.text")}</p>
        </footer>
      </div>
      <CommandSearch open={search} onClose={() => setSearch(false)} />
    </div>
  );
}
