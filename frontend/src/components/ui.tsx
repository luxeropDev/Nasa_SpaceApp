import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { AlertTriangle, ExternalLink, Loader2, RefreshCw, Search, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { api, ApiError } from "../api";
import { useI18n } from "../i18n";

/** Maps a thrown API error to a localized, human-readable message. */
export function useErrorText() {
  const { t } = useI18n();
  return useCallback((e: unknown): string => {
    if (e instanceof ApiError) {
      if (e.kind === "network") return t("error.network");
      if (e.status === 404) return t("error.notfound");
      if (e.status === 422) return t("error.validation");
      if (e.status >= 500) return t("error.server");
      return t("error.http", { status: e.status });
    }
    return t("error.server");
  }, [t]);
}

/** GET hook: refetches when the path or the interface language changes (api layer appends ?lang). */
export function useGet<T>(path: string | null) {
  const { lang } = useI18n();
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!path) return;
    let on = true;
    setError(null);
    api.get<T>(path).then((d) => on && setData(d)).catch((e) => on && setError(e));
    return () => { on = false; };
  }, [path, lang, tick]);
  return { data, error, loading: !data && !error, retry: () => setTick((n) => n + 1) };
}

export const Spinner = ({ size = 16, className = "" }: { size?: number; className?: string }) => (
  <Loader2 size={size} className={`animate-spin text-accent ${className}`} aria-hidden="true" />
);

export const Skeleton = ({ className = "" }: { className?: string }) => <div className={`skeleton ${className}`} aria-hidden="true" />;

export function PageSkeleton({ label }: { label?: string }) {
  const { t } = useI18n();
  return (
    <div className="space-y-4" role="status" aria-live="polite" aria-label={label ?? t("common.loading")}>
      <Skeleton className="h-9 w-64" />
      <Skeleton className="h-4 w-96 max-w-full" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24" />)}</div>
      <div className="grid gap-4 lg:grid-cols-5"><Skeleton className="h-64 lg:col-span-3" /><Skeleton className="h-64 lg:col-span-2" /></div>
    </div>
  );
}

export const Loading = ({ text }: { text?: string }) => {
  const { t } = useI18n();
  return <div className="flex items-center gap-2.5 p-6 text-sm text-muted" role="status" aria-live="polite"><Spinner />{text ?? t("common.loading")}…</div>;
};

export function ErrorBox({ error, retry }: { error: unknown; retry?: () => void }) {
  const { t } = useI18n();
  const text = useErrorText();
  return (
    <div role="alert" className="flex flex-wrap items-start gap-3 rounded-card border border-danger/40 bg-surface p-4">
      <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-ctl bg-danger/10 text-danger"><AlertTriangle size={16} /></span>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold text-fg">{t("error.title")}</div>
        <div className="mt-0.5 text-sm text-muted">{text(error)}</div>
      </div>
      {retry && <button className="btn btn-sm" onClick={retry}><RefreshCw size={13} />{t("common.retry")}</button>}
    </div>
  );
}

/** Empty / unavailable state with an icon medallion — used instead of blank space. */
export function Empty({ icon: I, title, text, action, compact = false }: { icon?: LucideIcon; title?: string; text: string; action?: ReactNode; compact?: boolean }) {
  return (
    <div className={`relative flex flex-col items-center overflow-hidden rounded-card border border-dashed border-line-strong text-center ${compact ? "gap-2 px-5 py-6" : "gap-3 px-6 py-12"}`}>
      {I && (
        <span className="relative grid h-10 w-10 place-items-center rounded-ctl border border-line bg-raised text-subtle">
          <I size={18} strokeWidth={1.6} />
        </span>
      )}
      {title && <p className="relative text-[15px] font-semibold text-fg">{title}</p>}
      <p className="relative max-w-md text-[13px] leading-relaxed text-muted">{text}</p>
      {action && <div className="relative mt-1">{action}</div>}
    </div>
  );
}

export const Panel = ({ title, sub, action, children, className = "", id, eyebrow }: { title?: ReactNode; sub?: ReactNode; action?: ReactNode; children: ReactNode; className?: string; id?: string; eyebrow?: ReactNode }) => (
  <section id={id} className={`panel fade p-5 ${className}`}>
    {(title || action || eyebrow) && (
      <header className="mb-4 flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
        <div className="min-w-0">
          {eyebrow && <div className="label mb-1">{eyebrow}</div>}
          {title && <h2 className="font-display text-[15.5px] font-semibold text-fg">{title}</h2>}
          {sub && <p className="mt-0.5 text-[12.5px] leading-relaxed text-subtle">{sub}</p>}
        </div>
        {action}
      </header>
    )}
    {children}
  </section>
);

export function Ext({ href, children, className = "" }: { href: string; children: ReactNode; className?: string }) {
  const { t } = useI18n();
  return (
    <a href={href} target="_blank" rel="noreferrer" title={t("common.external")} className={`inline-flex max-w-full items-center gap-1 break-words text-accent underline-offset-2 hover:underline ${className}`}>
      <span className="min-w-0">{children}</span><ExternalLink size={11} className="shrink-0" aria-hidden="true" />
    </a>
  );
}

/** Page container + editorial header. Every workspace page uses it so spacing stays consistent. */
export const Page = ({ title, sub, eyebrow, actions, children, wide = false }: { title: string; sub?: string; eyebrow?: string; actions?: ReactNode; children: ReactNode; wide?: boolean }) => (
  <div className={`mx-auto w-full px-4 pb-16 pt-6 sm:px-6 md:pt-8 lg:px-8 ${wide ? "max-w-[1560px]" : "max-w-[1440px]"}`}>
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4 border-b border-line pb-5">
      <div className="min-w-0 max-w-3xl">
        {eyebrow && <p className="eyebrow reveal mb-2">{eyebrow}</p>}
        <h1 className="reveal font-display text-[26px] font-semibold leading-tight text-fg sm:text-[30px]">{title}</h1>
        {sub && <p className="reveal mt-2 text-[14px] leading-relaxed text-muted">{sub}</p>}
      </div>
      {actions && <div className="reveal d-3 flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
    <div className="space-y-5">{children}</div>
  </div>
);

type Tone = "neutral" | "accent" | "brand" | "warn" | "ok" | "danger";
const CHIP: Record<Tone, string> = { neutral: "", accent: "chip-accent", brand: "chip-brand", warn: "chip-warn", ok: "chip-ok", danger: "chip-danger" };
/** Small tag used for statuses and metadata. */
export const Chip = ({ tone = "neutral", children, className = "", title }: { tone?: Tone; children: ReactNode; className?: string; title?: string }) => (
  <span title={title} className={`chip ${CHIP[tone]} ${className}`}>{children}</span>
);

/** Honest placeholder for values that are not present in the source data. */
export function NotAvailable({ short = false }: { short?: boolean }) {
  const { t } = useI18n();
  return <span className="text-[12.5px] italic text-subtle">{short ? t("common.na") : t("common.naLong")}</span>;
}

/** Segmented tabs with an animated indicator (radiogroup semantics, arrow-key navigation). */
export function Segmented<T extends string>({ value, options, onChange, label, size = "md" }: { value: T; options: { value: T; label: ReactNode; icon?: LucideIcon }[]; onChange: (v: T) => void; label: string; size?: "sm" | "md" }) {
  const wrap = useRef<HTMLDivElement>(null);
  const [ind, setInd] = useState<{ left: number; width: number } | null>(null);
  const idx = Math.max(0, options.findIndex((o) => o.value === value));
  useLayoutEffect(() => {
    const el = wrap.current?.querySelectorAll<HTMLButtonElement>("button")[idx];
    if (el) setInd({ left: el.offsetLeft, width: el.offsetWidth });
  }, [idx, options.length, value]);
  useEffect(() => {
    const on = () => { const el = wrap.current?.querySelectorAll<HTMLButtonElement>("button")[idx]; if (el) setInd({ left: el.offsetLeft, width: el.offsetWidth }); };
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, [idx]);
  const onKey = (e: React.KeyboardEvent) => {
    if (!["ArrowLeft", "ArrowRight"].includes(e.key)) return;
    e.preventDefault();
    const n = (idx + (e.key === "ArrowRight" ? 1 : options.length - 1)) % options.length;
    onChange(options[n].value);
    wrap.current?.querySelectorAll<HTMLButtonElement>("button")[n]?.focus();
  };
  return (
    <div ref={wrap} role="radiogroup" aria-label={label} onKeyDown={onKey} className="relative inline-flex max-w-full overflow-x-auto rounded-btn border border-line bg-raised p-0.5">
      {ind && <span aria-hidden="true" className="absolute top-0.5 bottom-0.5 rounded-[3px] bg-surface ring-1 ring-line-strong transition-all duration-200 ease-out" style={{ left: ind.left, width: ind.width }} />}
      {options.map((o) => {
        const I = o.icon;
        const on = o.value === value;
        return (
          <button key={o.value} type="button" role="radio" aria-checked={on} tabIndex={on ? 0 : -1} onClick={() => onChange(o.value)}
            className={`relative z-10 inline-flex items-center gap-1.5 whitespace-nowrap rounded-[3px] font-medium transition-colors duration-200 ${size === "sm" ? "px-2.5 py-1 text-xs" : "px-3 py-1.5 text-[13px]"} ${on ? "text-fg" : "text-subtle hover:text-fg"}`}>
            {I && <I size={14} aria-hidden="true" />}{o.label}
          </button>
        );
      })}
    </div>
  );
}

/** Search field with leading icon, loading indicator and clear button. */
export function SearchInput({ id, value, onChange, placeholder, label, busy = false, autoFocus = false, onKeyDown, className = "" }: {
  id: string; value: string; onChange: (v: string) => void; placeholder: string; label: string; busy?: boolean; autoFocus?: boolean; onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void; className?: string;
}) {
  const { t } = useI18n();
  return (
    <div className={`relative ${className}`}>
      <label htmlFor={id} className="sr-only">{label}</label>
      <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-subtle" aria-hidden="true" />
      <input id={id} type="search" className="input !py-2.5 !pl-9 !pr-16 [&::-webkit-search-cancel-button]:hidden" placeholder={placeholder} value={value} autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)} onKeyDown={onKeyDown} autoComplete="off" spellCheck={false} />
      <span className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1">
        {busy && <Spinner size={14} />}
        {value && <button type="button" className="rounded p-1 text-subtle hover:bg-hover hover:text-fg" onClick={() => onChange("")} aria-label={t("common.clear")}><X size={14} /></button>}
      </span>
    </div>
  );
}

/** Label / value row for definition lists. */
export const Field = ({ k, children }: { k: ReactNode; children: ReactNode }) => (
  <div className="grid grid-cols-1 gap-0.5 py-2.5 sm:grid-cols-[11rem_1fr] sm:gap-4">
    <dt className="text-[12.5px] text-subtle">{k}</dt>
    <dd className="min-w-0 break-words text-[13.5px] text-fg">{children}</dd>
  </div>
);

/** Epistemic label distinguishing what kind of statement a block contains. */
export type Epistemic = "record" | "derived" | "ai" | "rule" | "assumption" | "missing";
const EPI: Record<Epistemic, Tone> = { record: "ok", derived: "accent", ai: "brand", rule: "neutral", assumption: "warn", missing: "danger" };
export function EpistemicTag({ kind }: { kind: Epistemic }) {
  const { t } = useI18n();
  return <Chip tone={EPI[kind]} title={t(`epi.${kind}.hint`)} className="!font-mono !text-[10px] !uppercase !tracking-[.08em]">{t(`epi.${kind}`)}</Chip>;
}
