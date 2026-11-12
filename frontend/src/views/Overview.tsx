import { AlertTriangle, ArrowRight, ArrowUpRight, Clock, Quote } from "lucide-react";
import { useGet, ErrorBox, Panel, Empty, Skeleton } from "../components/ui";
import { Meter } from "../components/charts";
import { SourceLink } from "../components/research/SourceLink";
import HeroAtmosphere from "../components/HeroAtmosphere";
import { useI18n } from "../i18n";
import { href } from "../nav";
import { SAFETY_DOMAINS, SCENARIOS, family } from "../api";
import type { Health, Inv, Source } from "../api";
import Matrix from "./OverviewMatrix";
import type { Cell as MatrixCell } from "./OverviewMatrix";
import OverviewCharts from "./OverviewCharts";

type Ov = {
  dataset_version: string; record_status: string;
  kpis: { investigations: number; research_domains: number; source_documents: number; evidence_insights: number };
  by_domain: { name: string; count: number }[]; by_fuel: { key: string; count: number }[]; by_safety_domain: { key: string; count: number }[];
  mission_relevance: { key: string; name: string; count: number }[]; coverage_matrix: MatrixCell[];
  source_usage: { id: string; title: string; findings: number }[]; knowledge_gaps: { title: string; detail: string }[];
};
type Ins = { investigation_id: string; acronym: string; text: string; source_id: string; source_title: string; source_url: string }[];

function Hero({ health }: { health: Health | null }) {
  const { t } = useI18n();
  return (
    <section className="hero relative isolate overflow-hidden border-b border-white/10">
      <HeroAtmosphere caption={t("ov.hero.caption")} />
      <div className="relative mx-auto flex min-h-[520px] max-w-[1440px] flex-col justify-center px-5 py-16 sm:px-8 md:min-h-[600px] lg:min-h-[min(760px,calc(100vh-64px))] lg:px-8">
        <p className="eyebrow reveal text-[#FF9B45]">{t("ov.hero.eyebrow")}</p>
        <h1 className="reveal d-1 mt-5 max-w-4xl text-[44px] font-semibold leading-[1.02] tracking-[-0.04em] text-white sm:text-[56px] lg:text-[68px] xl:text-[76px]">
          {t("ov.hero.title1")}<br /><span className="text-white/55">{t("ov.hero.title2")}</span>
        </h1>
        <p className="reveal d-2 mt-6 max-w-xl text-[15px] leading-relaxed text-[#A5B4C7] sm:text-[17px]">{t("ov.hero.lead")}</p>
        <ul className="reveal d-3 mt-7 flex flex-wrap gap-x-5 gap-y-2 font-mono text-[10.5px] uppercase tracking-[.18em] text-white/60">
          {(["ov.hero.m1", "ov.hero.m2", "ov.hero.m3"] as const).map((k) => <li key={k} className="flex items-center gap-2"><span className="h-1 w-1 rounded-full bg-[#36BFFA]" aria-hidden="true" />{t(k)}</li>)}
        </ul>
        <div className="reveal d-4 mt-9 flex flex-wrap gap-3">
          <a className="btn-cut on-hero" href={href("explorer")}>{t("ov.cta.explore")}<ArrowRight size={16} /></a>
          <a className="btn-cut-border on-hero" href={href("assistant")}>{t("ov.cta.ask")}</a>
        </div>
        {health && (
          <p className="reveal d-5 mt-8 flex items-center gap-2 text-xs text-white/50">
            <span className={`h-1.5 w-1.5 rounded-full ${health.llm_live ? "bg-[#34D399]" : "bg-[#FBBF24]"}`} aria-hidden="true" />
            {health.llm_live ? t("ov.hero.statusLive") : t("ov.hero.statusDemo")}
          </p>
        )}
      </div>
    </section>
  );
}

function Metrics({ d }: { d: Ov }) {
  const { t } = useI18n();
  const items: [string, number, string][] = [
    [t("ov.kpi.inv"), d.kpis.investigations, t("ov.kpi.inv.note")],
    [t("ov.kpi.src"), d.kpis.source_documents, t("ov.kpi.src.note")],
    [t("ov.kpi.dom"), d.kpis.research_domains, t("ov.kpi.dom.note")],
    [t("ov.kpi.ins"), d.kpis.evidence_insights, t("ov.kpi.ins.note")],
  ];
  return (
    <section aria-labelledby="ov-metrics" className="fade">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="ov-metrics" className="label">{t("ov.metrics.title")}</h2>
        <p className="font-mono text-[11px] text-subtle">{t("ov.kpiNote", { version: d.dataset_version })}</p>
      </div>
      <dl className="mt-4 grid grid-cols-2 border-y border-line lg:grid-cols-4">
        {items.map(([l, v, n], i) => (
          <div key={l} className={`px-1 py-6 sm:px-5 ${i % 2 ? "border-l border-line pl-4" : ""} ${i >= 2 ? "border-t border-line lg:border-t-0" : ""} ${i === 2 ? "lg:border-l lg:pl-5" : ""}`}>
            <dt className="text-[12.5px] text-muted">{l}</dt>
            <dd className="mt-2 text-[44px] font-light leading-none tracking-[-0.04em] text-fg tabular-nums sm:text-[52px]">{v}</dd>
            <dd className="mt-2 text-[11.5px] leading-snug text-subtle">{n}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function Highlights({ invs, srcs }: { invs: Inv[]; srcs: Record<string, Source> }) {
  const { t, tc } = useI18n();
  // one representative record per investigation family, in knowledge-base order
  const seen = new Set<string>();
  const rows = invs.filter((i) => (seen.has(family(i.id)) ? false : (seen.add(family(i.id)), true)));
  const count = (f: string) => invs.filter((i) => family(i.id) === f).length;
  return (
    <section aria-labelledby="ov-hl" className="fade">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div><p className="eyebrow text-brand">{t("ov.hl.eyebrow")}</p><h2 id="ov-hl" className="mt-1.5 text-[22px] font-semibold tracking-tight text-fg sm:text-[26px]">{t("ov.hl.title")}</h2></div>
        <a className="btn btn-sm" href={href("explorer")}>{t("ov.hl.all", { n: invs.length })}<ArrowRight size={14} /></a>
      </div>
      <ul className="panel divide-y divide-line overflow-hidden">
        {rows.map((i) => {
          const kinds = Array.from(new Set(i.source_ids.map((s) => srcs[s]?.link_kind).filter(Boolean)));
          return (
            <li key={i.id}>
              <a href={href("explorer", i.id)} className="group grid gap-x-6 gap-y-2 px-4 py-4 transition-colors hover:bg-raised sm:px-5 md:grid-cols-[150px_1fr_auto]">
                <div className="flex items-center gap-2 md:block">
                  <span className="font-mono text-[11px] text-subtle">{i.id}</span>
                  <span className="block text-[15px] font-semibold text-fg md:mt-0.5">{i.acronym}</span>
                </div>
                <div className="min-w-0">
                  <p className="text-[13.5px] font-medium text-fg">{i.full_name}</p>
                  <p className="mt-1 line-clamp-2 text-[13px] leading-relaxed text-muted">{i.objective}</p>
                  <p className="mt-2 flex flex-wrap gap-1.5">
                    <span className="chip">{t("ov.hl.program", { p: family(i.id), n: count(family(i.id)) })}</span>
                    <span className="chip chip-accent">{i.research_domain}</span>
                    <span className="chip">{tc("fuel", i.fuel_type)}</span>
                  </p>
                </div>
                <div className="flex items-center justify-between gap-3 md:flex-col md:items-end md:justify-center">
                  <span className="text-[11.5px] text-subtle">{t("ov.hl.sources", { n: i.source_ids.length })}{kinds.length > 0 && ` · ${kinds.map((k) => t(`src.kind.${k!}`)).join(", ")}`}</span>
                  <ArrowUpRight size={16} className="text-subtle transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-accent" aria-hidden="true" />
                </div>
              </a>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Insights({ srcs }: { srcs: Record<string, Source> }) {
  const { t } = useI18n();
  const ins = useGet<Ins>("/insights");
  return (
    <section aria-labelledby="ov-ins" className="fade">
      <p className="eyebrow text-brand">{t("ov.ins.eyebrow")}</p>
      <h2 id="ov-ins" className="mt-1.5 text-[22px] font-semibold tracking-tight text-fg sm:text-[26px]">{t("ov.ins.title")}</h2>
      <p className="mt-1.5 max-w-2xl text-[13px] text-muted">{t("ov.ins.sub")}</p>
      {ins.error ? <div className="mt-4"><ErrorBox error={ins.error} retry={ins.retry} /></div> : !ins.data ? <Skeleton className="mt-4 h-40" /> : (
        <div className="stagger mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {ins.data.map((i) => (
            <figure key={i.investigation_id} className="panel flex flex-col p-5">
              <Quote size={18} className="text-brand/70" aria-hidden="true" />
              <blockquote className="mt-3 flex-1 text-[14px] leading-relaxed text-fg">{i.text}</blockquote>
              <figcaption className="mt-4 space-y-2 border-t border-line pt-3">
                <a href={href("explorer", i.investigation_id)} className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-fg hover:text-accent">{i.acronym}<span className="font-mono text-[11px] font-normal text-subtle">{i.investigation_id}</span></a>
                <SourceLink title={i.source_title} url={i.source_url} kind={srcs[i.source_id]?.link_kind} compact />
              </figcaption>
            </figure>
          ))}
        </div>
      )}
    </section>
  );
}

export default function Overview({ health }: { health: Health | null }) {
  const { t, tc } = useI18n();
  const ov = useGet<Ov>("/overview");
  const inv = useGet<Inv[]>("/investigations");
  const src = useGet<Source[]>("/sources");
  const srcs = Object.fromEntries((src.data ?? []).map((s) => [s.id, s]));
  const d = ov.data;

  return (
    <>
      <Hero health={health} />
      <div className="mx-auto w-full max-w-[1440px] space-y-14 px-4 pb-16 pt-10 sm:px-6 lg:px-8">
        {ov.error ? <ErrorBox error={ov.error} retry={ov.retry} /> : !d ? <Skeleton className="h-40" /> : <Metrics d={d} />}

        {inv.error ? <ErrorBox error={inv.error} retry={inv.retry} /> : !inv.data ? <Skeleton className="h-96" /> : <Highlights invs={inv.data} srcs={srcs} />}

        <Insights srcs={srcs} />

        {d && (
          <section aria-labelledby="ov-cov" className="space-y-4">
            <div>
              <p className="eyebrow text-brand">{t("ov.cov.eyebrow")}</p>
              <h2 id="ov-cov" className="mt-1.5 text-[22px] font-semibold tracking-tight text-fg sm:text-[26px]">{t("ov.cov.title")}</h2>
            </div>
            <Panel title={t("ov.matrix.title")} sub={t("ov.matrix.sub")}>
              <Matrix cells={d.coverage_matrix} scenarios={SCENARIOS} domains={SAFETY_DOMAINS} />
            </Panel>
            <div className="grid gap-4 lg:grid-cols-2">
              <Panel title={t("ov.rel.title")} sub={t("ov.rel.sub")}>
                <div className="space-y-4">{d.mission_relevance.map((m) => <Meter key={m.key} value={m.count} max={d.kpis.investigations} label={m.name} count={`${m.count}/${d.kpis.investigations}`} />)}</div>
              </Panel>
              <Panel title={t("ov.sd.title")} sub={t("ov.sd.sub")}>
                <div className="space-y-4">{d.by_safety_domain.map((m) => <Meter key={m.key} value={m.count} max={d.kpis.investigations} label={tc("sd", m.key)} count={m.count} tone={m.count < 3 ? "warn" : "accent"} />)}</div>
              </Panel>
            </div>
            <OverviewCharts byDomain={d.by_domain} byFuel={d.by_fuel} total={d.kpis.investigations} />
            <div className="grid gap-4 lg:grid-cols-2">
              <Panel title={t("ov.gaps.title")} sub={t("ov.gaps.sub")}>
                <ul className="space-y-3.5">{d.knowledge_gaps.map((g) => (
                  <li key={g.title} className="flex gap-3"><span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-ctl bg-warn/10 text-warn"><AlertTriangle size={14} /></span><div><div className="text-[13.5px] font-medium text-fg">{g.title}</div><div className="mt-0.5 text-[12.5px] leading-relaxed text-muted">{g.detail}</div></div></li>
                ))}</ul>
              </Panel>
              <Panel title={t("ov.use.title")} sub={t("ov.use.sub")}>
                <div className="space-y-3.5">{d.source_usage.map((s) => <Meter key={s.id} value={s.findings} max={Math.max(1, ...d.source_usage.map((x) => x.findings))} label={s.title} count={s.findings} tone={s.findings === 0 ? "warn" : "accent"} />)}</div>
              </Panel>
            </div>
          </section>
        )}

        <section aria-labelledby="ov-act" className="grid gap-4 lg:grid-cols-5">
          <div className="lg:col-span-2">
            <p className="eyebrow text-brand">{t("ov.act.eyebrow")}</p>
            <h2 id="ov-act" className="mt-1.5 text-[22px] font-semibold tracking-tight text-fg">{t("ov.act.title")}</h2>
            <p className="mt-2 text-[13px] leading-relaxed text-muted">{d?.record_status}</p>
          </div>
          <div className="lg:col-span-3"><Empty compact icon={Clock} title={t("ov.act.emptyTitle")} text={t("ov.act.empty")} action={<a className="btn btn-sm" href={href("sources")}>{t("ov.act.provenance")}</a>} /></div>
        </section>

        <section aria-labelledby="ov-flow">
          <h2 id="ov-flow" className="label mb-3">{t("ov.flow.title")}</h2>
          <ol className="grid gap-3 md:grid-cols-3">
            {[
              { k: "ov.flow.1" as const, to: href("assistant", null, { q: t("as.s1") }) },
              { k: "ov.flow.2" as const, to: href("compare", null, { ids: "BASS_001,SAFFIRE_001" }) },
              { k: "ov.flow.3" as const, to: href("intel", null, { scenario: "lunar_habitat", domain: "smoke_detection" }) },
            ].map((f, i) => (
              <li key={f.k}><a href={f.to} className="panel panel-hover group flex h-full items-start gap-3 p-4 text-[13.5px] text-fg">
                <span className="font-mono text-[11px] text-brand">0{i + 1}</span><span className="flex-1">{t(f.k)}</span><ArrowRight size={15} className="mt-0.5 text-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-fg" /></a></li>
            ))}
          </ol>
          <p className="mt-4 font-mono text-[11px] leading-relaxed text-subtle">{t("ov.sys")}</p>
        </section>
      </div>
    </>
  );
}
