import type { CSSProperties } from "react";
import { useChartTheme } from "../theme";

/** Recharts tooltip style that follows the active theme. */
export function useTooltipStyle(): { contentStyle: CSSProperties; cursor: { fill: string }; itemStyle: CSSProperties; labelStyle: CSSProperties } {
  const c = useChartTheme();
  return {
    contentStyle: { background: c.tipBg, border: `1px solid ${c.tipBorder}`, borderRadius: 10, fontSize: 12, color: c.text, boxShadow: "0 12px 32px rgba(0,0,0,.25)" },
    cursor: { fill: c.cursor },
    itemStyle: { color: c.text },
    labelStyle: { color: c.text, fontWeight: 600 },
  };
}

type MeterTone = "accent" | "warn" | "ok" | "brand";
const BAR: Record<MeterTone, string> = { accent: "bg-accent", warn: "bg-warn", ok: "bg-ok", brand: "bg-brand" };

/** Accessible, animated horizontal meter. */
export function Meter({ value, max, label, count, tone = "accent" }: { value: number; max: number; label: string; count?: string | number; tone?: MeterTone }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-3 text-[13px]"><span className="min-w-0 text-fg">{label}</span><span className="shrink-0 font-mono text-xs text-muted">{count ?? value}</span></div>
      <div className="h-1.5 overflow-hidden bg-raised" role="meter" aria-valuenow={value} aria-valuemin={0} aria-valuemax={max} aria-label={label}>
        <div className={`bar-grow h-full  ${BAR[tone]}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="panel p-4">
      <div className="label">{label}</div>
      <div className="mt-2 text-[28px] font-semibold leading-none tracking-tight text-fg tabular-nums">{value}</div>
      {hint && <div className="mt-1.5 truncate text-xs text-subtle">{hint}</div>}
    </div>
  );
}

/**
 * Linear 0–100 scale for a composite relevance score. Segments show the weighted contribution of each component.
 * Deliberately not a gauge: the number is a transparent ranking aid, not a probability or a measured quantity.
 */
export function ScoreScale({ value, segments, label, caption }: { value: number; segments: { key: string; points: number; color: string }[]; label: string; caption?: string }) {
  return (
    <figure className="min-w-0" role="img" aria-label={`${label}: ${value} / 100`}>
      <div className="flex items-baseline gap-2">
        <span className="font-mono text-[40px] font-medium leading-none text-fg tabular-nums">{value}</span>
        <span className="font-mono text-[12px] text-subtle">/ 100</span>
      </div>
      {caption && <figcaption className="mt-1 text-[11.5px] text-muted">{caption}</figcaption>}
      <div className="mt-3 flex h-3 w-full overflow-hidden border border-line bg-raised" aria-hidden="true">
        {segments.map((s) => <i key={s.key} className="h-full border-r border-surface last:border-r-0" style={{ width: `${s.points}%`, background: s.color }} />)}
      </div>
      <div className="relative mt-1 h-3 font-mono text-[9.5px] text-subtle" aria-hidden="true">
        {[0, 25, 50, 75, 100].map((n) => <span key={n} className="absolute -translate-x-1/2 first:translate-x-0 last:-translate-x-full" style={{ left: `${n}%` }}>{n}</span>)}
      </div>
    </figure>
  );
}
