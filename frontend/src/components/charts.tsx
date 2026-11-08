import type { CSSProperties } from "react";
import { useChartTheme } from "../theme";

/** Recharts tooltip style that follows the active theme. */
export function useTooltipStyle(): { contentStyle: CSSProperties; cursor: { fill: string }; itemStyle: CSSProperties; labelStyle: CSSProperties } {
  const c = useChartTheme();
  return {
    contentStyle: { background: c.tipBg, border: `1px solid ${c.tipBorder}`, borderRadius: 10, fontSize: 12, color: c.text, boxShadow: "0 8px 24px rgba(0,0,0,.18)" },
    cursor: { fill: c.cursor },
    itemStyle: { color: c.text },
    labelStyle: { color: c.text, fontWeight: 600 },
  };
}

/** Accessible, animated horizontal meter used instead of ad-hoc bars. */
export function Meter({ value, max, label, count, tone = "accent" }: { value: number; max: number; label: string; count?: string | number; tone?: "accent" | "warn" | "ok" }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  const bar = tone === "warn" ? "bg-warn" : tone === "ok" ? "bg-ok" : "bg-accent";
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-3 text-sm"><span className="min-w-0 text-fg">{label}</span><span className="font-mono text-xs text-muted">{count ?? value}</span></div>
      <div className="h-2 overflow-hidden rounded-full bg-raised" role="meter" aria-valuenow={value} aria-valuemin={0} aria-valuemax={max} aria-label={label}>
        <div className={`bar-grow h-full rounded-full ${bar}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="panel p-4">
      <div className="label">{label}</div>
      <div className="mt-1.5 font-mono text-3xl font-semibold tracking-tight text-fg">{value}</div>
      {hint && <div className="mt-1 text-xs text-subtle">{hint}</div>}
    </div>
  );
}
