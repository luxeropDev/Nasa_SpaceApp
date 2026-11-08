import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AlertTriangle } from "lucide-react";
import { Panel, Chip } from "../components/ui";
import { Stat, useTooltipStyle } from "../components/charts";
import { useI18n } from "../i18n";
import type { Key } from "../i18n";
import { useChartTheme } from "../theme";
import { href } from "../nav";

export type Res = {
  scenario_label: string; domain_label: string;
  results: { id: string; acronym: string; full_name: string; score: number; factors: { dimension: string; weight: number; value: number; points: number }[]; evidence: { text: string; source_id: string }[]; limitations: string[]; source_ids: string[] }[];
  knowledge_gaps: string[]; recommendations: string[];
  methodology: { title: string; disclaimer: string; dimensions: { key: string; weight: number; desc: string }[] };
};

export default function IntelResults({ res }: { res: Res }) {
  const { t } = useI18n();
  const ch = useChartTheme();
  const tip = useTooltipStyle();
  const dim = (k: string) => t(`in.dim.${k}` as Key);
  const keys = res.methodology.dimensions.map((d) => d.key);
  const color = (k: string) => ch.series[keys.indexOf(k) % ch.series.length];
  const chart = res.results.map((r) => ({ name: r.acronym, ...Object.fromEntries(r.factors.map((f) => [f.dimension, f.points])) }));
  const best = res.results[0];
  return (
    <div className="space-y-5">
      <div className="stagger grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Stat label={t("in.best")} value={best ? best.score : "\u2014"} hint={best?.acronym} />
        <Stat label={t("in.records")} value={res.results.length} />
        <div className="col-span-2 lg:col-span-1"><Stat label={t("in.method")} value={keys.length} hint={keys.map(dim).join(" \u00b7 ")} /></div>
      </div>
      <div className="grid gap-4 lg:grid-cols-5">
        <Panel className="lg:col-span-3" title={`${t("in.top.title")} — ${res.scenario_label} · ${res.domain_label}`} sub={t("in.top.sub")}>
          <div className="h-72" role="img" aria-label={t("in.top.title")}><ResponsiveContainer>
            <BarChart data={chart} layout="vertical" margin={{ left: 4, right: 12 }}>
              <CartesianGrid stroke={ch.grid} horizontal={false} />
              <XAxis type="number" domain={[0, 100]} stroke={ch.axis} fontSize={11} tickLine={false} />
              <YAxis type="category" dataKey="name" width={84} stroke={ch.axis} fontSize={11} tickLine={false} axisLine={false} />
              <Tooltip {...tip} formatter={(v: number, n: string) => [v, dim(n)]} />
              {keys.map((k, i) => <Bar key={k} dataKey={k} stackId="s" fill={color(k)} radius={i === keys.length - 1 ? [0, 6, 6, 0] : 0} />)}
            </BarChart>
          </ResponsiveContainer></div>
          <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">{res.methodology.dimensions.map((d) => <li key={d.key} className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-sm" style={{ background: color(d.key) }} />{dim(d.key)} ({d.weight})</li>)}</ul>
        </Panel>
        <Panel className="lg:col-span-2" title={t("in.method")} sub={res.methodology.title}>
          <ul className="space-y-3 text-xs leading-relaxed text-muted">{res.methodology.dimensions.map((d) => <li key={d.key} className="flex gap-2.5"><i className="mt-1 h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: color(d.key) }} /><span><b className="font-semibold text-fg">{dim(d.key)} · {t("in.points", { n: d.weight })}</b><br />{d.desc}</span></li>)}</ul>
        </Panel>
      </div>
      <Panel title={t("in.evidence")}>
        <ol className="stagger space-y-3">{res.results.map((r, idx) => (
          <li key={r.id} className="rounded-xl border border-line bg-raised/40 p-4">
            <div className="flex items-start justify-between gap-3">
              <a href={href("explorer", r.id)} className="min-w-0 text-left font-semibold text-fg hover:text-accent" title={t("in.openRecord")}>{idx + 1}. {r.acronym} <span className="block text-xs font-normal text-subtle sm:inline sm:pl-1">{r.full_name}</span></a>
              <Chip tone="accent" className="!font-mono !text-sm">{r.score}</Chip>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-raised" aria-hidden="true"><div className="bar-grow h-full rounded-full bg-accent" style={{ width: `${r.score}%` }} /></div>
            <p className="mt-3 text-sm leading-relaxed text-fg">{r.evidence[0]?.text}</p>
            <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 sm:grid-cols-5">{r.factors.map((f) => <div key={f.dimension} className="font-mono text-[11px] text-subtle">{dim(f.dimension)}: <span className="text-fg">{f.points}/{f.weight}</span></div>)}</div>
            {r.limitations[0] && <p className="mt-3 text-xs leading-relaxed text-warn"><b>{t("in.limitation")}:</b> {r.limitations[0]}</p>}
          </li>))}</ol>
      </Panel>
      <div className="grid gap-4 md:grid-cols-2">
        <Panel title={t("in.gaps")}><ul className="space-y-3 text-sm leading-relaxed text-muted">{res.knowledge_gaps.map((g) => <li key={g} className="flex gap-2.5"><AlertTriangle size={14} className="mt-1 shrink-0 text-warn" />{g}</li>)}</ul></Panel>
        <Panel title={t("in.recs")}><ul className="list-disc space-y-2 pl-4 text-sm leading-relaxed text-muted marker:text-accent">{res.recommendations.map((g) => <li key={g}>{g}</li>)}</ul>
          <p className="mt-4 text-xs text-subtle">{t("in.sourcesNote")}</p></Panel>
      </div>
    </div>
  );
}
