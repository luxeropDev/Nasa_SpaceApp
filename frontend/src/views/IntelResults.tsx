import { useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AlertTriangle, ArrowRight, FlaskConical, HelpCircle, Ruler, Sigma } from "lucide-react";
import { Panel, EpistemicTag } from "../components/ui";
import { ScoreScale, useTooltipStyle } from "../components/charts";
import { useI18n } from "../i18n";
import type { Key } from "../i18n";
import { useChartTheme } from "../theme";
import { href } from "../nav";

export type Factor = { dimension: string; weight: number; value: number; points: number };
export type Res = {
  scenario: string; domain: string; scenario_label: string; domain_label: string;
  results: { id: string; acronym: string; full_name: string; score: number; factors: Factor[]; evidence: { text: string; source_id: string }[]; limitations: string[]; source_ids: string[] }[];
  knowledge_gaps: string[]; recommendations: string[];
  methodology: { title: string; disclaimer: string; dimensions: { key: string; weight: number; desc: string }[] };
};

export default function IntelResults({ res }: { res: Res }) {
  const { t } = useI18n();
  const ch = useChartTheme();
  const tip = useTooltipStyle();
  const [sel, setSel] = useState(0);
  const dim = (k: string) => t(`in.dim.${k}` as Key);
  const keys = res.methodology.dimensions.map((d) => d.key);
  const color = (k: string) => ch.series[keys.indexOf(k) % ch.series.length];
  const chart = res.results.map((r) => ({ name: r.acronym, ...Object.fromEntries(r.factors.map((f) => [f.dimension, f.points])) }));
  const cur = res.results[Math.min(sel, res.results.length - 1)];
  if (!cur) return null;

  const classes = [
    { icon: Ruler, k: "in.cls.measure", d: t("in.cls.measure.d"), tag: <EpistemicTag kind="missing" /> },
    { icon: Sigma, k: "in.cls.derived", d: t("in.cls.derived.d"), tag: <EpistemicTag kind="derived" /> },
    { icon: FlaskConical, k: "in.cls.assume", d: t("in.cls.assume.d"), tag: <EpistemicTag kind="assumption" /> },
    { icon: HelpCircle, k: "in.cls.unknown", d: t("in.cls.unknown.d"), tag: <EpistemicTag kind="missing" /> },
  ] as const;

  return (
    <div className="space-y-5">
      <div className="grid gap-5 lg:grid-cols-5">
        <section className="panel fade p-5 lg:col-span-3" aria-labelledby="in-score">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="label">{t("in.selected")}</p>
              <h2 id="in-score" className="mt-1 text-[20px] font-semibold tracking-tight text-fg">{cur.acronym} <span className="text-[14px] font-normal text-subtle">{cur.full_name}</span></h2>
              <p className="mt-0.5 text-[12.5px] text-subtle">{res.scenario_label} · {res.domain_label}</p>
            </div>
            <EpistemicTag kind="derived" />
          </div>
          <div className="mt-5 grid items-start gap-6 sm:grid-cols-[220px_1fr]">
            <ScoreScale value={cur.score} label={t("in.scoreLabel")} caption={t("in.scoreCaption")} segments={cur.factors.map((f) => ({ key: f.dimension, points: f.points, color: color(f.dimension) }))} />
            <ul className="space-y-3">
              {cur.factors.map((f) => (
                <li key={f.dimension}>
                  <div className="mb-1 flex items-baseline justify-between gap-2 text-[12.5px]">
                    <span className="flex items-center gap-2 text-fg"><i className="h-2 w-2 rounded-sm" style={{ background: color(f.dimension) }} aria-hidden="true" />{dim(f.dimension)}</span>
                    <span className="font-mono text-[11px] text-muted">{f.value.toFixed(2)} × {f.weight} = <b className="font-semibold text-fg">{f.points}</b></span>
                  </div>
                  <div className="relative h-1.5 overflow-hidden bg-raised" role="meter" aria-label={dim(f.dimension)} aria-valuenow={f.points} aria-valuemin={0} aria-valuemax={f.weight}>
                    <div className="absolute inset-y-0 left-0 bg-line-strong" style={{ width: `${f.weight}%` }} aria-hidden="true" />
                    <div className="bar-grow absolute inset-y-0 left-0 " style={{ width: `${f.points}%`, background: color(f.dimension) }} />
                  </div>
                </li>
              ))}
            </ul>
          </div>
          <p className="mt-5 border-t border-line pt-3 text-[12.5px] leading-relaxed text-muted">{t("in.scoreExplain", { score: cur.score, name: cur.acronym })}</p>
          {cur.evidence[0] && <p className="mt-3 text-[13px] leading-relaxed text-fg"><span className="label mr-2 !text-[9.5px]">{t("in.evidenceLabel")}</span>{cur.evidence[0].text}</p>}
          {cur.limitations[0] && <p className="mt-2 text-[12.5px] leading-relaxed text-warn"><b>{t("in.limitation")}:</b> {cur.limitations[0]}</p>}
          <a className="mt-3 inline-flex items-center gap-1 text-[12.5px] text-accent hover:underline" href={href("explorer", cur.id)}>{t("in.openRecord")}<ArrowRight size={12} /></a>
        </section>

        <section className="panel fade p-5 lg:col-span-2" aria-labelledby="in-rank">
          <h2 id="in-rank" className="text-[15px] font-semibold text-fg">{t("in.ranking")}</h2>
          <p className="mt-0.5 text-[12.5px] text-subtle">{t("in.rankingSub")}</p>
          <ol className="mt-3 space-y-1" role="listbox" aria-label={t("in.ranking")}>
            {res.results.map((r, n) => (
              <li key={r.id}>
                <button role="option" aria-selected={n === sel} onClick={() => setSel(n)} className={`grid w-full grid-cols-[1.5rem_1fr_auto] items-center gap-2 rounded-ctl px-2 py-2 text-left transition-colors ${n === sel ? "bg-hover" : "hover:bg-hover/60"}`}>
                  <span className="font-mono text-[11px] text-subtle">{String(n + 1).padStart(2, "0")}</span>
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] font-medium text-fg">{r.acronym}</span>
                    <span className="mt-1 flex h-1 overflow-hidden bg-raised" aria-hidden="true">{r.factors.map((f) => <i key={f.dimension} style={{ width: `${f.points}%`, background: color(f.dimension) }} />)}</span>
                  </span>
                  <span className="font-mono text-[13px] font-semibold tabular-nums text-fg">{r.score}</span>
                </button>
              </li>
            ))}
          </ol>
          <ul className="mt-4 flex flex-wrap gap-x-3 gap-y-1 border-t border-line pt-3 text-[11px] text-muted">{res.methodology.dimensions.map((d) => <li key={d.key} className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-sm" style={{ background: color(d.key) }} />{dim(d.key)} ({d.weight})</li>)}</ul>
        </section>
      </div>

      <Panel title={t("in.top.title")} sub={t("in.top.sub")}>
        <div className="h-64" role="img" aria-label={t("in.top.title")}><ResponsiveContainer>
          <BarChart data={chart} layout="vertical" margin={{ left: 4, right: 12 }}>
            <CartesianGrid stroke={ch.grid} horizontal={false} />
            <XAxis type="number" domain={[0, 100]} stroke={ch.axis} fontSize={11} tickLine={false} />
            <YAxis type="category" dataKey="name" width={84} stroke={ch.axis} fontSize={11} tickLine={false} axisLine={false} />
            <Tooltip {...tip} formatter={(v: number, n: string) => [v, dim(n)]} />
            {keys.map((k, i) => <Bar key={k} dataKey={k} stackId="s" fill={color(k)} barSize={16} radius={i === keys.length - 1 ? [0, 4, 4, 0] : 0} />)}
          </BarChart>
        </ResponsiveContainer></div>
      </Panel>

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title={t("in.method")} sub={res.methodology.title}>
          <table className="w-full text-[12.5px]">
            <thead><tr className="border-b border-line text-left"><th className="py-2 pr-2 font-medium text-subtle">{t("in.dimension")}</th><th className="py-2 pr-2 text-right font-medium text-subtle">{t("in.weight")}</th></tr></thead>
            <tbody>{res.methodology.dimensions.map((d) => (
              <tr key={d.key} className="border-b border-line align-top last:border-0">
                <td className="py-2.5 pr-3"><span className="flex items-center gap-2 font-medium text-fg"><i className="h-2 w-2 rounded-sm" style={{ background: color(d.key) }} />{dim(d.key)}</span><span className="mt-1 block leading-relaxed text-muted">{d.desc}</span></td>
                <td className="py-2.5 text-right font-mono text-fg">{d.weight}</td>
              </tr>))}</tbody>
          </table>
          <p className="mt-3 text-[12px] leading-relaxed text-subtle">{t("in.notProbability")}</p>
        </Panel>
        <Panel title={t("in.cls.title")} sub={t("in.cls.sub")}>
          <ul className="space-y-4">{classes.map((c) => { const I = c.icon; return (
            <li key={c.k} className="flex gap-3"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-ctl border border-line bg-raised text-muted"><I size={15} /></span>
              <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="text-[13px] font-medium text-fg">{t(c.k)}</span>{c.tag}</div><p className="mt-0.5 text-[12.5px] leading-relaxed text-muted">{c.d}</p></div></li>); })}</ul>
        </Panel>
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        <Panel title={t("in.gaps")}><ul className="space-y-3 text-[13px] leading-relaxed text-muted">{res.knowledge_gaps.map((g) => <li key={g} className="flex gap-2.5"><AlertTriangle size={14} className="mt-1 shrink-0 text-warn" />{g}</li>)}</ul></Panel>
        <Panel title={t("in.recs")}><ul className="space-y-2.5 text-[13px] leading-relaxed text-muted">{res.recommendations.map((g) => <li key={g} className="flex gap-2.5"><span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-accent" aria-hidden="true" />{g}</li>)}</ul>
          <p className="mt-4 text-[12px] text-subtle">{t("in.sourcesNote")}</p></Panel>
      </div>
    </div>
  );
}
