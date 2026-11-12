import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { useI18n } from "../../i18n";
import type { Key } from "../../i18n";
import { href } from "../../nav";
import type { View } from "../../nav";
import { Wordmark } from "../Logo";
import { GROUPS, ICONS } from "./navItems";

type Props = { view: View; collapsed: boolean; onToggle?: () => void; onNavigate?: () => void; footer?: React.ReactNode };

/** Primary navigation. Rendered fixed on desktop and inside the drawer on mobile. */
export default function Sidebar({ view, collapsed, onToggle, onNavigate, footer }: Props) {
  const { t } = useI18n();
  return (
    <div className="flex h-full flex-col">
      <div className={`flex h-14 shrink-0 items-center ${collapsed ? "justify-center px-2" : "px-4"}`}>
        <a href={href("overview")} onClick={onNavigate} className="rounded-ctl" aria-label={t("brand.home")}>
          <Wordmark collapsed={collapsed} sub={t("brand.tag")} />
        </a>
      </div>
      <nav aria-label={t("nav.main")} className={`flex-1 px-2.5 pb-3 pt-2 ${collapsed ? "" : "overflow-y-auto"}`}>
        {GROUPS.map((g) => (
          <div key={g.key} className="mb-4">
            {collapsed ? <div className="mx-auto mb-2 h-px w-6 bg-line" aria-hidden="true" /> : <p className="label mb-1.5 px-2.5 !text-[9.5px]">{t(g.key)}</p>}
            <ul className="space-y-0.5">
              {g.views.map((v) => {
                const I = ICONS[v];
                const active = view === v;
                const label = t(`nav.${v}` as Key);
                return (
                  <li key={v} className="group relative">
                    <a href={href(v)} onClick={onNavigate} aria-current={active ? "page" : undefined} aria-label={collapsed ? label : undefined}
                      className={`relative flex items-center gap-3 rounded-ctl py-2 text-[13.5px] font-medium transition-colors duration-200 ${collapsed ? "justify-center px-0" : "px-2.5"} ${active ? "bg-hover text-fg" : "text-muted hover:bg-hover/60 hover:text-fg"}`}>
                      {active && <span aria-hidden="true" className="absolute -left-2.5 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-brand" />}
                      <I size={17} strokeWidth={active ? 2.1 : 1.8} className={`shrink-0 ${active ? "text-accent" : ""}`} aria-hidden="true" />
                      {!collapsed && <span className="truncate">{label}</span>}
                    </a>
                    {collapsed && (
                      <span role="tooltip" className="pointer-events-none absolute left-full top-1/2 z-50 ml-3 -translate-y-1/2 whitespace-nowrap rounded-ctl border border-line-strong bg-surface px-2.5 py-1.5 text-xs font-medium text-fg opacity-0 shadow-pop transition-opacity duration-150 group-focus-within:opacity-100 group-hover:opacity-100">
                        {label}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
      <div className={`shrink-0 border-t border-line p-2.5 ${collapsed ? "flex flex-col items-center gap-2" : "space-y-2"}`}>
        {footer}
        {onToggle && (
          <button type="button" onClick={onToggle} className={`flex w-full items-center gap-3 rounded-ctl py-2 text-[12.5px] text-subtle transition-colors hover:bg-hover hover:text-fg ${collapsed ? "justify-center" : "px-2.5"}`}
            aria-label={collapsed ? t("nav.expand") : t("nav.collapse")} title={collapsed ? t("nav.expand") : t("nav.collapse")}>
            {collapsed ? <PanelLeftOpen size={16} /> : <><PanelLeftClose size={16} /><span>{t("nav.collapse")}</span></>}
          </button>
        )}
      </div>
    </div>
  );
}
