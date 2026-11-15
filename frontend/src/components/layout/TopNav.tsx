import { useEffect, useRef, useState } from "react";
import { ChevronDown, ExternalLink, Menu, Search, X } from "lucide-react";
import type { Health } from "../../api";
import { useI18n } from "../../i18n";
import type { Key } from "../../i18n";
import { href } from "../../nav";
import type { View } from "../../nav";
import { Wordmark } from "../Logo";
import { LangSwitch } from "../Switchers";
import { GROUPS, ICONS, groupOf } from "./navItems";
import type { NavGroup, NavItem } from "./navItems";

type HealthState = { data: Health | null; error: unknown };
type Props = { view: View; health: HealthState; onAbout: () => void; onSearch: () => void };

/** Data-source status: shows only what the backend actually reports. */
function StatusDot({ health, onClick, withLabel = false }: { health: HealthState; onClick: () => void; withLabel?: boolean }) {
  const { t } = useI18n();
  const online = !!health.data;
  const live = health.data?.llm_live;
  const label = !online ? (health.error ? t("status.offline") : t("top.checking")) : live ? t("mode.live") : t("mode.demo");
  const dot = !online ? (health.error ? "bg-danger text-danger" : "bg-subtle text-subtle") : live ? "bg-ok text-ok" : "bg-warn text-warn";
  return (
    <button type="button" onClick={onClick} aria-haspopup="dialog" title={`${t("top.system")}: ${label}`}
      className={`inline-flex h-9 items-center gap-2 rounded-ctl text-xs font-medium text-muted transition-colors duration-200 hover:bg-hover hover:text-fg ${withLabel ? "px-3" : "w-9 justify-center"}`}>
      <span className={`h-2 w-2 shrink-0 rounded-full ${dot}`} aria-hidden="true" />
      {withLabel ? <span>{label}</span> : <span className="sr-only">{t("top.system")}: {label}</span>}
    </button>
  );
}

/** One menu entry, rendered identically in the desktop dropdown and the mobile menu. */
function Entry({ item, view, onPick, onAbout }: { item: NavItem; view: View; onPick: () => void; onAbout: () => void }) {
  const { t } = useI18n();
  const base = "group/item flex w-full items-start gap-3 px-3 py-3 text-left transition-colors duration-150";
  const body = (I: typeof Search, title: string, desc: string, active: boolean, ext = false) => (
    <>
      <span className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center border transition-colors duration-150 ${active ? "border-accent bg-accent text-on-accent" : "border-line bg-raised text-muted group-hover/item:border-line-strong group-hover/item:text-fg"}`}>
        <I size={15} strokeWidth={1.9} aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className={`flex items-center gap-1.5 text-[13.5px] font-medium ${active ? "text-fg" : "text-fg/90"}`}>
          {title}{ext && <ExternalLink size={11} className="text-subtle" aria-hidden="true" />}
          {active && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-accent" aria-hidden="true" />}
        </span>
        <span className="mt-0.5 block text-[12px] leading-snug text-subtle">{desc}</span>
      </span>
    </>
  );
  if (item.kind === "view") {
    const active = item.view === view;
    return (
      <a href={href(item.view)} onClick={onPick} aria-current={active ? "page" : undefined} className={`${base} ${active ? "bg-hover" : "hover:bg-hover/70"}`}>
        {body(ICONS[item.view], t(`nav.${item.view}` as Key), t(`nav.${item.view}.desc` as Key), active)}
      </a>
    );
  }
  if (item.kind === "docs") {
    return <a href={item.href} target="_blank" rel="noreferrer" onClick={onPick} className={`${base} hover:bg-hover/70`}>{body(item.icon, t("nav.docs"), t("nav.docs.desc"), false, true)}</a>;
  }
  return <button type="button" onClick={() => { onPick(); onAbout(); }} aria-haspopup="dialog" className={`${base} hover:bg-hover/70`}>{body(item.icon, t("nav.about"), t("nav.about.desc"), false)}</button>;
}

/** Click-to-open dropdown (disclosure pattern): Esc / outside click close it, only one is open at a time. */
function Dropdown({ group, view, open, setOpen, onAbout }: { group: NavGroup; view: View; open: boolean; setOpen: (k: string | null) => void; onAbout: () => void }) {
  const { t } = useI18n();
  const wrap = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const active = groupOf(view)?.key === group.key;
  const id = `menu-${group.key.replace(/\./g, "-")}`;
  const featured = group.key === "nav.g.research"
    ? { title: t("nav.feature.research"), desc: t("nav.feature.research.d"), to: href("explorer", "SAFFIRE_001") }
    : group.key === "nav.g.intelligence"
      ? { title: t("nav.feature.lunar"), desc: t("nav.feature.lunar.d"), to: href("scenarios", null, { s: "lunar_habitat" }) }
      : { title: t("nav.feature.data"), desc: t("nav.feature.data.d"), to: href("datasets") };

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(null); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { setOpen(null); btn.current?.focus(); } };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("pointerdown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open, setOpen]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); if (!open) setOpen(group.key); window.setTimeout(() => wrap.current?.querySelector<HTMLElement>(`#${id} a, #${id} button`)?.focus(), 0); }
  };
  const onPanelKey = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const els = Array.from(wrap.current?.querySelectorAll<HTMLElement>(`#${id} a, #${id} button`) ?? []);
    const i = els.indexOf(document.activeElement as HTMLElement);
    els[(i + (e.key === "ArrowDown" ? 1 : els.length - 1)) % els.length]?.focus();
  };

  return (
    <div ref={wrap} className="relative">
      <button ref={btn} type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen(open ? null : group.key)} onKeyDown={onKeyDown}
        className={`relative inline-flex h-11 items-center gap-1 px-3 text-[14px] font-bold transition-colors duration-150 ${open ? "bg-hover text-fg" : active ? "text-fg hover:bg-hover/70" : "text-muted hover:bg-hover/70 hover:text-fg"}`}>
        {t(group.key)}
        <ChevronDown size={14} className={`text-subtle transition-transform duration-200 ${open ? "rotate-180" : ""}`} aria-hidden="true" />
        {active && <span aria-hidden="true" className="absolute inset-x-3 -bottom-[18px] h-[3px] bg-brand" />}
      </button>
      {open && (
        <div id={id} onKeyDown={onPanelKey} className="zone-dark absolute left-0 top-[calc(100%+18px)] z-50 w-[720px] border-t border-white/20 bg-black p-6 shadow-[0_12px_24px_rgb(0_0_0/.24)]" style={{ animation: "pop-in .14s ease-out both" }}>
          <div className="grid grid-cols-[1.15fr_.85fr] gap-7">
            <div><p className="label mb-3 !text-[10px]">{t(group.key)}</p><ul className="grid grid-cols-2 gap-1">{group.items.map((it, n) => <li key={n}><Entry item={it} view={view} onPick={() => setOpen(null)} onAbout={onAbout} /></li>)}</ul></div>
            <a href={featured.to} onClick={() => setOpen(null)} className="group border-l border-line pl-6">
              <p className="label text-brand">{t("nav.featured")}</p>
              <h3 className="mt-4 font-display text-[23px] font-bold leading-tight text-white group-hover:text-brand">{featured.title}</h3>
              <p className="mt-3 text-[12.5px] leading-relaxed text-muted">{featured.desc}</p>
              <span className="mt-5 inline-block border-b border-white pb-1 text-sm font-bold text-white group-hover:border-brand group-hover:text-brand">{t("common.open")}</span>
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

/** Full-width mobile menu with expandable categories. */
function MobileMenu({ view, onClose, onAbout, onSearch, health }: { view: View; onClose: () => void; onAbout: () => void; onSearch: () => void; health: HealthState }) {
  const { t } = useI18n();
  const box = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState<string | null>(groupOf(view)?.key ?? "nav.g.research");
  useEffect(() => {
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    box.current?.querySelector<HTMLElement>("button, a")?.focus();
    const on = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", on);
    return () => { document.removeEventListener("keydown", on); document.body.style.overflow = overflow; };
  }, [onClose]);
  return (
    <div id="mobile-menu" ref={box} role="dialog" aria-modal="true" aria-label={t("nav.main")} className="zone-dark no-print fixed inset-x-0 bottom-0 top-16 z-[55] overflow-y-auto border-t border-line bg-black lg:hidden" style={{ animation: "fadeIn .2s ease-out both" }}>
      <div className="mx-auto max-w-xl space-y-1 px-4 pb-10 pt-4">
        <button type="button" onClick={() => { onClose(); onSearch(); }} className="mb-5 flex h-12 w-full items-center gap-2.5 border border-line bg-surface px-3 text-[14px] text-subtle">
          <Search size={16} aria-hidden="true" />{t("cmd.open")}
        </button>
        <a href={href("overview")} onClick={onClose} aria-current={view === "overview" ? "page" : undefined}
          className={`flex h-14 items-center px-3 text-[16px] font-bold ${view === "overview" ? "bg-hover text-fg" : "text-fg/90 hover:bg-hover/70"}`}>
          {t("nav.overview")}{view === "overview" && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-accent" aria-hidden="true" />}
        </a>
        {GROUPS.map((g) => {
          const isOpen = expanded === g.key;
          const pid = `m-${g.key.replace(/\./g, "-")}`;
          return (
            <section key={g.key} className="border-t border-line">
              <button type="button" aria-expanded={isOpen} aria-controls={pid} onClick={() => setExpanded(isOpen ? null : g.key)}
                className="flex h-12 w-full items-center px-3 text-left text-[15px] font-medium text-fg">
                {t(g.key)}
                {groupOf(view)?.key === g.key && <span className="ml-2 h-1.5 w-1.5 rounded-full bg-accent" aria-hidden="true" />}
                <ChevronDown size={16} className={`ml-auto text-subtle transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`} aria-hidden="true" />
              </button>
              {isOpen && <ul id={pid} className="pb-3" style={{ animation: "fadeUpSm .25s cubic-bezier(0.16,1,0.3,1) both" }}>{g.items.map((it, n) => <li key={n}><Entry item={it} view={view} onPick={onClose} onAbout={onAbout} /></li>)}</ul>}
            </section>
          );
        })}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
          <StatusDot health={health} onClick={() => { onClose(); onAbout(); }} withLabel />
          <LangSwitch />
        </div>
      </div>
    </div>
  );
}

export default function TopNav({ view, health, onAbout, onSearch }: Props) {
  const { t } = useI18n();
  const [open, setOpen] = useState<string | null>(null);
  const [mobile, setMobile] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => { setOpen(null); setMobile(false); }, [view]);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 8);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const on = () => mq.matches && setMobile(false);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

  return (
    <>
      <header className={`zone-dark no-print sticky top-0 z-50 border-b border-white/15 bg-black transition-shadow duration-200 ${scrolled && !mobile ? "shadow-[0_4px_12px_rgb(0_0_0/.14)]" : ""}`}>
        <div className="mx-auto flex h-16 max-w-[1600px] items-center gap-2 px-4 sm:px-6 lg:h-20 lg:px-8">
          <a href={href("overview")} className="flex shrink-0 items-center" aria-label={t("brand.home")}>
            <Wordmark variant="white" />
          </a>
          <span className="mx-3 hidden h-5 w-px bg-line-strong lg:block" aria-hidden="true" />
          <nav aria-label={t("nav.main")} className="hidden items-center gap-0.5 lg:flex">
            <a href={href("overview")} aria-current={view === "overview" ? "page" : undefined}
              className={`relative inline-flex h-11 items-center px-3 text-[14px] font-bold transition-colors duration-150 ${view === "overview" ? "text-fg" : "text-muted hover:bg-hover/70 hover:text-fg"}`}>
              {t("nav.overview")}
              {view === "overview" && <span aria-hidden="true" className="absolute inset-x-3 -bottom-[18px] h-[3px] bg-brand" />}
            </a>
            {GROUPS.map((g) => <Dropdown key={g.key} group={g} view={view} open={open === g.key} setOpen={setOpen} onAbout={onAbout} />)}
          </nav>

          <div className="ml-auto flex items-center gap-1.5">
            <button type="button" onClick={onSearch} aria-haspopup="dialog" aria-label={t("cmd.open")}
              className="flex h-10 items-center gap-2 border border-line-strong bg-black px-3 text-[13px] text-subtle transition-colors duration-150 hover:border-white/60 hover:text-fg xl:w-52">
              <Search size={15} className="shrink-0" aria-hidden="true" />
              <span className="hidden truncate xl:inline">{t("cmd.short")}</span>
              <span className="kbd ml-auto hidden whitespace-nowrap xl:inline">{/Mac|iPhone|iPad/.test(navigator.platform) ? "⌘K" : "Ctrl K"}</span>
            </button>
            <div className="hidden items-center gap-1.5 lg:flex">
              <StatusDot health={health} onClick={onAbout} />
              <LangSwitch />
            </div>
            <button type="button" className="icon-btn lg:hidden" onClick={() => setMobile((m) => !m)} aria-expanded={mobile} aria-controls="mobile-menu" aria-label={mobile ? t("nav.close") : t("nav.menu")}>
              {mobile ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>
      </header>
      {mobile && <MobileMenu view={view} health={health} onClose={() => setMobile(false)} onAbout={onAbout} onSearch={onSearch} />}
    </>
  );
}
