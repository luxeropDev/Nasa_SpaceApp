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
      <div className="h-1.5 overflow-hidden rounded-full bg-raised" role="meter" aria-valuenow={value} aria-valuemin={0} aria-valuemax={max} aria-label={label}>
        <div className={`bar-grow h-full rounded-full ${BAR[tone]}`} style={{ width: `${pct}%` }} />
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

/** Radial gauge for a 0–100 score. Segments show the weighted contribution of each component. */
export function RadialScore({ value, segments, size = 184, label, caption }: { value: number; segments: { key: string; points: number; color: string }[]; size?: number; label: string; caption?: string }) {
  const ch = useChartTheme();
  const r = size / 2 - 12;
  const c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <figure className="relative mx-auto" style={{ width: size, height: size }} role="img" aria-label={`${label}: ${value} / 100`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={ch.track} strokeWidth={12} />
        {segments.map((s) => {
          const len = (s.points / 100) * c;
          const el = <circle key={s.key} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={s.color} strokeWidth={12} strokeDasharray={`${Math.max(0, len - 2)} ${c}`} strokeDashoffset={-offset} className="transition-all duration-700 ease-out" />;
          offset += len;
          return el;
        })}
      </svg>
      <figcaption className="absolute inset-0 grid place-items-center text-center">
        <div>
          <div className="text-[40px] font-semibold leading-none tracking-tight text-fg tabular-nums">{value}</div>
          <div className="mt-1 font-mono text-[10.5px] uppercase tracking-[.14em] text-subtle">/ 100</div>
          {caption && <div className="mt-1 max-w-[9rem] text-[11px] leading-tight text-muted">{caption}</div>}
        </div>
      </figcaption>
    </figure>
  );
}
