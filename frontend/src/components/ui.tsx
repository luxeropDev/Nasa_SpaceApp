import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { AlertTriangle, ExternalLink, Inbox, RefreshCw } from "lucide-react";
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
export function useGet<T>(path: string) {
  const { lang } = useI18n();
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let on = true;
    setError(null);
    api.get<T>(path).then((d) => on && setData(d)).catch((e) => on && setError(e));
    return () => { on = false; };
  }, [path, lang, tick]);
  return { data, error, loading: !data && !error, retry: () => setTick((n) => n + 1) };
}

export const Spinner = ({ size = 16 }: { size?: number }) => (
  <span className="inline-block animate-spin rounded-full border-2 border-accent/30 border-t-accent" style={{ width: size, height: size }} role="status" aria-hidden="true" />
);

export const Skeleton = ({ className = "" }: { className?: string }) => <div className={`skeleton ${className}`} aria-hidden="true" />;

export function PageSkeleton({ label }: { label?: string }) {
  const { t } = useI18n();
  return (
    <div className="space-y-4" role="status" aria-live="polite" aria-label={label ?? t("common.loading")}>
      <Skeleton className="h-10 w-72" />
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
    <div role="alert" className="panel flex items-start gap-3 border-warn/40 p-4">
      <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-warn/10 text-warn"><AlertTriangle size={16} /></span>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold text-fg">{t("error.title")}</div>
        <div className="mt-0.5 text-sm text-muted">{text(error)}</div>
      </div>
      {retry && <button className="btn" onClick={retry}><RefreshCw size={14} />{t("common.retry")}</button>}
    </div>
  );
}

export const Empty = ({ text, action }: { text: string; action?: ReactNode }) => (
  <div className="panel flex flex-col items-center gap-3 px-6 py-12 text-center">
    <span className="grid h-11 w-11 place-items-center rounded-2xl bg-raised text-subtle"><Inbox size={20} /></span>
    <p className="max-w-sm text-sm text-muted">{text}</p>
    {action}
  </div>
);

export const Panel = ({ title, sub, action, children, className = "" }: { title?: string; sub?: string; action?: ReactNode; children: ReactNode; className?: string }) => (
  <section className={`panel fade p-5 ${className}`}>
    {(title || action) && (
      <header className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0"><h2 className="text-[15px] font-semibold text-fg">{title}</h2>{sub && <p className="mt-0.5 text-xs leading-relaxed text-subtle">{sub}</p>}</div>
        {action}
      </header>
    )}
    {children}
  </section>
);

export function Ext({ href, children }: { href: string; children: ReactNode }) {
  const { t } = useI18n();
  return (
    <a href={href} target="_blank" rel="noreferrer" title={t("common.external")} className="inline-flex max-w-full items-center gap-1 break-words text-accent underline-offset-2 hover:underline">
      <span className="min-w-0">{children}</span><ExternalLink size={11} className="shrink-0" aria-hidden="true" />
    </a>
  );
}

export const Page = ({ title, sub, actions, children }: { title: string; sub: string; actions?: ReactNode; children: ReactNode }) => (
  <div className="space-y-5">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0"><h1 className="text-2xl font-semibold tracking-tight text-fg sm:text-[28px]">{title}</h1><p className="mt-1.5 max-w-3xl text-sm leading-relaxed text-muted">{sub}</p></div>
      {actions}
    </div>
    {children}
  </div>
);

/** Small pill showing a tone: used for statuses and tags. */
export const Chip = ({ tone = "neutral", children, className = "" }: { tone?: "neutral" | "accent" | "warn" | "ok"; children: ReactNode; className?: string }) => (
  <span className={`chip ${tone === "accent" ? "chip-accent" : tone === "warn" ? "chip-warn" : tone === "ok" ? "chip-ok" : ""} ${className}`}>{children}</span>
);

