import { useEffect, useState } from "react";
import { Activity, Database, Flame, GitCompareArrows, LayoutDashboard, Menu, MessageSquareText, ShieldAlert, Telescope, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Chip } from "./ui";
import { LangSwitch, ThemeSwitch } from "./Switchers";
import { useI18n } from "../i18n";
import type { Key } from "../i18n";
import { VIEWS, href } from "../nav";
import type { View } from "../nav";

const ICONS: Record<View, LucideIcon> = { overview: LayoutDashboard, explorer: Telescope, assistant: MessageSquareText, compare: GitCompareArrows, intel: ShieldAlert, sources: Database };
export type Health = { status: string; dataset_version: string; mode: string; llm_provider: string | null; llm_live: boolean };

function NavLinks({ view, onNavigate, vertical = false }: { view: View; onNavigate?: () => void; vertical?: boolean }) {
  const { t } = useI18n();
  return (
    <ul className={vertical ? "flex flex-col gap-1" : "flex items-center gap-0.5"}>
      {VIEWS.map((v) => {
        const I = ICONS[v];
        const active = view === v;
        return (
          <li key={v}>
            <a href={href(v)} onClick={onNavigate} aria-current={active ? "page" : undefined} title={t(`nav.${v}.full` as Key)}
              className={`flex items-center gap-2 rounded-full px-3 py-2 text-sm font-medium transition-colors ${vertical ? "!rounded-xl py-3" : ""} ${active ? "bg-accent/10 text-accent" : "text-muted hover:bg-raised hover:text-fg"}`}>
              <I size={16} aria-hidden="true" />
              <span>{vertical ? t(`nav.${v}.full` as Key) : t(`nav.${v}` as Key)}</span>
            </a>
          </li>
        );
      })}
    </ul>
  );
}

type Props = { view: View; health: { data: Health | null; error: unknown }; onStatus: () => void };

export default function TopBar({ view, health, onStatus }: Props) {
  const { t } = useI18n();
  const [menu, setMenu] = useState(false);

  useEffect(() => { setMenu(false); }, [view]);
  useEffect(() => {
    if (!menu) return;
    const on = (e: KeyboardEvent) => e.key === "Escape" && setMenu(false);
    document.addEventListener("keydown", on);
    return () => document.removeEventListener("keydown", on);
  }, [menu]);

  const online = !!health.data;
  const sysLabel = online ? t("top.online") : health.error ? t("top.offline") : t("top.checking");
  const dot = online ? "bg-ok text-ok" : health.error ? "bg-warn text-warn" : "bg-subtle text-subtle";
  const live = health.data?.llm_live;

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-line bg-bg/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-[1400px] items-center gap-3 px-4 md:px-6">
          <a href={href("overview")} className="flex shrink-0 items-center gap-2.5 rounded-xl pr-1" aria-label="FLAMEWISE">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-accent/10 ring-1 ring-accent/30"><Flame size={18} className="text-accent" /></span>
            <span className="hidden leading-tight sm:block"><span className="block text-sm font-semibold tracking-[.18em] text-fg">FLAMEWISE</span><span className="label !text-[9px] !tracking-[.14em]">{t("brand.tag")}</span></span>
          </a>
          <nav aria-label={t("nav.main")} className="ml-2 hidden min-w-0 flex-1 lg:block"><NavLinks view={view} /></nav>
          <div className="ml-auto flex items-center gap-2">
            <button onClick={onStatus} aria-haspopup="dialog" className="hidden items-center gap-2 rounded-full border border-line bg-surface px-3 py-1.5 text-xs font-medium text-muted transition hover:border-accent/50 hover:text-fg md:inline-flex">
              <span className={`status-dot h-2 w-2 rounded-full ${dot}`} aria-hidden="true" />
              <span>{t("top.system")}: {sysLabel}</span>
              {health.data && <span className="hidden border-l border-line pl-2 font-mono text-[10.5px] text-subtle xl:inline">{health.data.dataset_version}</span>}
            </button>
            <button onClick={onStatus} className="btn btn-ghost !p-2 md:hidden" aria-label={`${t("top.system")}: ${sysLabel}`} aria-haspopup="dialog">
              <span className={`status-dot h-2.5 w-2.5 rounded-full ${dot}`} aria-hidden="true" /><Activity size={16} />
            </button>
            <LangSwitch />
            <ThemeSwitch />
            <button className="btn btn-ghost !p-2 lg:hidden" onClick={() => setMenu((m) => !m)} aria-expanded={menu} aria-controls="mobile-nav" aria-label={menu ? t("nav.close") : t("nav.menu")}>
              {menu ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>
        <div className="border-t border-line/60 bg-surface/50">
          <div className="mx-auto flex h-8 max-w-[1400px] items-center gap-3 overflow-hidden px-4 md:px-6">
            <Chip tone="accent">{t("top.spaceapps")}</Chip>
            <span className="label hidden truncate sm:inline">{t("top.research")}</span>
            <span className="ml-auto"><Chip tone={live ? "ok" : "warn"}>{live ? t("mode.live") : t("mode.demo")}</Chip></span>
          </div>
        </div>
        {menu && (
          <div id="mobile-nav" className="absolute inset-x-0 top-full border-b border-line bg-surface p-3 shadow-pop lg:hidden" style={{ animation: "sheet-in .2s ease-out both" }}>
            <nav aria-label={t("nav.main")}><NavLinks view={view} vertical onNavigate={() => setMenu(false)} /></nav>
          </div>
        )}
      </header>
      {menu && <button className="fixed inset-0 top-16 z-30 bg-black/40 lg:hidden" aria-label={t("nav.close")} tabIndex={-1} onClick={() => setMenu(false)} />}
    </>
  );
}
