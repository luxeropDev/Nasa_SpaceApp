import { useState } from "react";
import { AlertTriangle, ArrowRight, Clock, FileSearch, GitCompareArrows, Network, Orbit, Search, ShieldAlert, Sparkles } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useGet, ErrorBox, Panel, Empty, Skeleton } from "../components/ui";
import { Meter } from "../components/charts";
import { SourceLink } from "../components/research/SourceLink";
import { CoverageBar, StatusFlags } from "../components/research/Completeness";
import { StatusBadge } from "../components/research/Evidence";
import { DarkZone } from "../zone";
import { useI18n } from "../i18n";
import type { Key } from "../i18n";
import { go, href } from "../nav";
import { SAFETY_DOMAINS, SCENARIOS, family } from "../api";
import type { Health, Inv, Provenance, Resources, Source } from "../api";
import { completeness } from "../lib/completeness";
import Matrix from "./OverviewMatrix";
import type { Cell as MatrixCell } from "./OverviewMatrix";
import OverviewCharts from "./OverviewCharts";
import ResearchCardMedia from "../components/research/ResearchCardMedia";

type Ov = {
  dataset_version: string; record_status: string;
  kpis: { investigations: number; research_domains: number; source_documents: number; evidence_insights: number };
  by_domain: { name: string; count: number }[]; by_fuel: { key: string; count: number }[]; by_safety_domain: { key: string; count: number }[];
  mission_relevance: { key: string; name: string; count: number }[]; coverage_matrix: MatrixCell[];
  source_usage: { id: string; title: string; findings: number }[]; knowledge_gaps: { title: string; detail: string }[];
  provenance: Provenance;
};
type Ins = { investigation_id: string; acronym: string; text: string; source_id: string; source_title: string; source_url: string }[];

/** Section heading with a hairline rule — the editorial divider used throughout the overview. */
function Head({ id, title, meta, action }: { id: string; title: string; meta?: string; action?: React.ReactNode }) {
  return (
    <div className="rule-head mb-3 flex-wrap">
      <h2 id={id} className="font-display text-[17px] font-semibold text-fg">{title}</h2>
      {meta && <span className="font-mono text-[11px] text-subtle">{meta}</span>}
      {action && <span className="ml-auto">{action}</span>}
    </div>
  );
}

/** Photo-led introduction. The photograph is the supplied project image (cropped for web); it is labelled as illustrative. */
function Intro({ health, p }: { health: Health | null; p: Provenance | null }) {
  const { t } = useI18n();
  const [q, setQ] = useState("");
  return (
    <DarkZone as="section" aria-labelledby="ov-title" className="relative isolate min-h-[620px] overflow-hidden bg-black">
      <figure className="absolute inset-0 -z-20 bg-black">
        <picture>
          <source type="image/webp" srcSet="/media/hero-960.webp 960w, /media/hero-1600.webp 1600w, /media/hero-2400.webp 2400w" sizes="100vw" />
          <img src="/media/hero-1600.jpg" srcSet="/media/hero-960.jpg 960w, /media/hero-1600.jpg 1600w, /media/hero-2400.jpg 2400w" sizes="100vw"
            width={2400} height={1106} alt={t("v4.hero.alt")} loading="eager" decoding="async" className="h-full w-full object-cover object-[65%_42%]" />
        </picture>
        <figcaption className="absolute bottom-3 right-4 z-10 max-w-[60%] bg-black/70 px-2 py-1 text-right text-[10px] leading-snug text-muted">{t("v4.hero.caption")}</figcaption>
      </figure>
      <div aria-hidden="true" className="absolute inset-0 -z-10 bg-[linear-gradient(90deg,rgba(0,0,0,.96)_0%,rgba(0,0,0,.85)_35%,rgba(0,0,0,.25)_75%,rgba(0,0,0,.15)_100%)]" />
      <div aria-hidden="true" className="absolute inset-0 -z-10 bg-[linear-gradient(0deg,rgba(0,0,0,.9)_0%,transparent_42%)]" />
      <div className="mx-auto flex min-h-[620px] max-w-[1600px] items-end px-4 pb-10 pt-20 sm:px-6 md:pb-14 lg:px-10 lg:pb-16">
        <div className="w-full max-w-[790px]">
          <p className="eyebrow flex flex-wrap items-center gap-x-3 gap-y-1 text-white/75">
            <span>{t("ov2.kicker")}</span>
            {health && <span className="text-muted">{t("ov2.dataset", { v: health.dataset_version })}</span>}
          </p>
          <h1 id="ov-title" className="mt-4 text-[42px] font-bold leading-[.98] tracking-[-.045em] text-white sm:text-[58px] lg:text-[72px]">{t("ov2.title")}</h1>
          <p className="mt-5 max-w-2xl text-[16px] leading-relaxed text-white/80 sm:text-[18px]">{t("ov2.lead")}</p>
          <div className="mt-7 flex flex-wrap items-center gap-5">
            <a className="inline-flex h-12 items-center gap-2 bg-brand px-6 text-[15px] font-bold text-white hover:bg-brand/90" href={href("explorer")}>{t("v4.ov.toExplorer")}<ArrowRight size={16} /></a>
            <a className="border-b border-white/70 pb-1 text-sm font-semibold text-white hover:border-brand hover:text-brand" href={href("scenarios", null, { s: "lunar_habitat" })}>{t("ov3.lunar.action")}</a>
          </div>
          <form role="search" className="mt-6 flex max-w-xl gap-2" onSubmit={(e) => { e.preventDefault(); go(href("explorer", null, q.trim() ? { q: q.trim() } : undefined)); }}>
            <label htmlFor="ov-q" className="sr-only">{t("ex.search.label")}</label>
            <div className="relative flex-1">
              <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-subtle" aria-hidden="true" />
              <input id="ov-q" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("ov2.search.ph")} className="input !h-11 !pl-9" autoComplete="off" />
            </div>
            <button className="btn !h-11 !border-white/40 !bg-transparent !px-5 !text-white hover:!bg-white/10">{t("ov2.search.go")}</button>
          </form>
          <p className="mt-2 text-[11px] text-white/55">{t("ov3.search.note")}</p>
        </div>
      </div>
    </DarkZone>
  );
}

function StatsStrip({ p }: { p: Provenance | null }) {
  const { t } = useI18n();
  if (!p) return <Skeleton className="h-24" />;
  const rows: [Key, number | string][] = [["v4.kpi.psi", p.psi_investigations], ["v4.kpi.rows", p.psi_table_rows.toLocaleString()], ["v4.kpi.doi", p.psi_publications_with_doi], ["v4.kpi.pages", p.document_pages]];
  return <section className="border-b border-line bg-white"><dl className="mx-auto grid max-w-[1600px] grid-cols-2 px-4 sm:px-6 lg:grid-cols-4 lg:px-10">{rows.map(([k, v], n) => <div key={k} className={`py-5 ${n % 2 ? "border-l border-line pl-5" : "pr-5"} lg:border-l lg:border-line lg:px-7 ${n === 0 ? "lg:border-l-0 lg:pl-0" : ""}`}><dd className="font-display text-[28px] font-bold tracking-tight text-fg">{v}</dd><dt className="mt-1 text-[11px] leading-snug text-muted">{t(k)}</dt></div>)}</dl></section>;
}

function Featured({ invs }: { invs: Inv[] }) {
  const { t } = useI18n();
  const wanted = ["SAFFIRE_001", "BASS_001", "FLEX_001", "SAME_001"];
  const records = wanted.map((id) => invs.find((x) => x.id === id)).filter(Boolean) as Inv[];
  return <section className="mx-auto max-w-[1600px] px-4 py-14 sm:px-6 md:py-20 lg:px-10">
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4"><div><p className="eyebrow text-accent">{t("ov3.featured.kicker")}</p><h2 className="mt-3 font-display text-[34px] font-bold tracking-[-.035em] text-fg sm:text-[44px]">{t("ov3.featured.title")}</h2></div><a className="inline-flex items-center gap-2 font-bold text-accent hover:underline" href={href("explorer")}>{t("ov3.featured.all")}<ArrowRight size={16} /></a></div>
    <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">{records.map((i) => <article key={i.id} className="group border border-line bg-white">
      <ResearchCardMedia inv={i} aspect="aspect-[16/10]" />
      <div className="p-5"><p className="font-mono text-[10px] uppercase tracking-[.1em] text-accent">{i.id}</p><h3 className="mt-2 font-display text-[21px] font-bold leading-tight"><a className="hover:text-accent" href={href("explorer", i.id)}>{i.full_name}</a></h3><p className="mt-3 line-clamp-3 text-[13.5px] leading-relaxed text-muted">{i.objective}</p><a className="mt-5 inline-flex items-center gap-2 text-sm font-bold text-accent hover:underline" href={href("explorer", i.id)}>{t("common.open")}<ArrowRight size={14} /></a></div>
    </article>)}</div>
  </section>;
}

function ResearchTools() {
  const { t } = useI18n();
  const items = [{ k: "ov3.tool.compare", d: "ov3.tool.compare.d", to: href("compare"), I: GitCompareArrows }, { k: "ov3.tool.scenario", d: "ov3.tool.scenario.d", to: href("scenarios"), I: Orbit }, { k: "ov3.tool.coverage", d: "ov3.tool.coverage.d", to: href("sources"), I: FileSearch }] as const;
  return <section className="bg-bg2"><div className="mx-auto max-w-[1600px] px-4 py-14 sm:px-6 md:py-20 lg:px-10"><p className="eyebrow text-accent">{t("ov3.tools.kicker")}</p><h2 className="mt-3 font-display text-[34px] font-bold tracking-[-.035em] sm:text-[44px]">{t("ov3.tools.title")}</h2><div className="mt-8 grid border-y border-line md:grid-cols-3">{items.map(({ k, d, to, I }, n) => <a key={k} href={to} className={`group p-6 hover:bg-white md:p-8 ${n ? "border-t border-line md:border-l md:border-t-0" : ""}`}><I size={23} className="text-brand" /><h3 className="mt-5 text-[22px] font-bold group-hover:text-accent">{t(k)}</h3><p className="mt-2 text-[14px] leading-relaxed text-muted">{t(d)}</p><span className="mt-5 inline-flex items-center gap-2 text-sm font-bold text-accent">{t("common.open")}<ArrowRight size={14} /></span></a>)}</div></div></section>;
}

function LunarFeature() {
  const { t } = useI18n();
  return <DarkZone as="section" className="bg-black"><div className="mx-auto grid max-w-[1600px] gap-10 px-4 py-16 sm:px-6 md:py-24 lg:grid-cols-[1.1fr_.9fr] lg:px-10"><div><p className="eyebrow text-brand">{t("ov3.lunar.kicker")}</p><h2 className="mt-4 max-w-3xl font-display text-[40px] font-bold leading-[1.02] tracking-[-.04em] text-white sm:text-[56px]">{t("ov3.lunar.title")}</h2></div><div className="self-end"><p className="text-[16px] leading-relaxed text-muted">{t("ov3.lunar.body")}</p><p className="mt-4 border-l-2 border-brand pl-4 text-[12.5px] leading-relaxed text-subtle">{t("ov3.lunar.limit")}</p><a className="mt-7 inline-flex h-11 items-center gap-2 bg-brand px-5 font-bold text-white" href={href("scenarios", null, { s: "lunar_habitat" })}>{t("ov3.lunar.action")}<ArrowRight size={15} /></a></div></div></DarkZone>;
}

function DataSummary({ p }: { p: Provenance }) {
  const { t } = useI18n();
  return <section className="mx-auto max-w-[1600px] px-4 py-14 sm:px-6 md:py-20 lg:px-10"><div className="grid gap-10 lg:grid-cols-[.8fr_1.2fr]"><div><p className="eyebrow text-accent">{t("ov3.data.kicker")}</p><h2 className="mt-3 font-display text-[34px] font-bold tracking-[-.035em] sm:text-[44px]">{t("ov3.data.title")}</h2><p className="mt-4 max-w-xl text-[15px] leading-relaxed text-muted">{t("ov3.data.body", { n: p.records_total })}</p></div><div className="border-t border-line"><div className="grid gap-5 border-b border-line py-5 sm:grid-cols-2"><div><h3 className="font-bold">{t("ov3.data.strength")}</h3><p className="mt-2 text-sm leading-relaxed text-muted">{t("ov3.data.strength.d")}</p></div><div><h3 className="font-bold text-warn">{t("ov3.data.limit")}</h3><p className="mt-2 text-sm leading-relaxed text-muted">{t("ov3.data.limit.d")}</p></div></div><div className="flex flex-wrap gap-x-6 gap-y-3 pt-5"><a className="font-bold text-accent hover:underline" href={href("datasets")}>{t("nav.datasets")}</a><a className="font-bold text-accent hover:underline" href={href("sources")}>{t("nav.sources")}</a><a className="font-bold text-accent hover:underline" href={href("graph")}>{t("nav.graph")}</a></div></div></div></section>;
}

/** Investigation catalog extract: one row per program, with completeness shown, not hidden. */
function Programs({ invs, srcs }: { invs: Inv[]; srcs: Record<string, Source> }) {
  const { t, tc } = useI18n();
  const seen = new Set<string>();
  const rows = invs.filter((i) => (seen.has(family(i.id)) ? false : (seen.add(family(i.id)), true)));
  const count = (f: string) => invs.filter((i) => family(i.id) === f).length;
  return (
    <section aria-labelledby="ov-hl">
      <Head id="ov-hl" title={t("ov2.programs.title")} meta={t("ov2.programs.meta", { n: rows.length, total: invs.length })}
        action={<a className="inline-flex items-center gap-1 text-[12.5px] text-accent hover:underline" href={href("explorer")}>{t("ov.hl.all", { n: invs.length })}<ArrowRight size={13} /></a>} />
      <div className="overflow-x-auto border border-line bg-surface">
        <table className="w-full min-w-[720px] text-left text-[13px]">
          <thead className="border-b border-line bg-raised text-[11.5px] text-subtle">
            <tr>
              <th scope="col" className="px-3 py-2 font-medium">{t("ov2.col.id")}</th>
              <th scope="col" className="px-3 py-2 font-medium">{t("ov2.col.inv")}</th>
              <th scope="col" className="px-3 py-2 font-medium">{t("ov2.col.platform")}</th>
              <th scope="col" className="px-3 py-2 font-medium">{t("ov2.col.domain")}</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">{t("ov2.col.records")}</th>
              <th scope="col" className="px-3 py-2 font-medium">{t("ov2.col.data")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((i) => {
              const c = completeness(i, srcs);
              return (
                <tr key={i.id} className="align-top transition-colors hover:bg-raised">
                  <td className="whitespace-nowrap px-3 py-2.5"><a href={href("explorer", i.id)} className="font-mono text-[12px] font-medium text-accent hover:underline">{i.id}</a></td>
                  <td className="px-3 py-2.5"><span className="font-semibold text-fg">{i.acronym}</span><span className="block text-[12px] text-muted">{i.full_name}</span></td>
                  <td className="px-3 py-2.5 text-[12.5px] text-muted">{i.hardware}<span className="block text-[11.5px] text-subtle">{i.gravity_environment}</span></td>
                  <td className="px-3 py-2.5 text-[12.5px] text-muted">{i.research_domain}<span className="block text-[11.5px] text-subtle">{tc("fuel", i.fuel_type)} · {tc("sd", i.fire_safety_domain)}</span></td>
                  <td className="px-3 py-2.5 text-right font-mono text-[12px] tabular-nums text-fg">{count(family(i.id))}</td>
                  <td className="px-3 py-2.5"><CoverageBar c={c} /><span className="mt-1 block"><StatusFlags c={c} max={2} /></span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Findings({ srcs }: { srcs: Record<string, Source> }) {
  const { t } = useI18n();
  const ins = useGet<Ins>("/insights");
  return (
    <section aria-labelledby="ov-ins">
      <Head id="ov-ins" title={t("ov.ins.title")} meta={t("ov2.ins.meta")} />
      <p className="mb-3 max-w-3xl text-[12.5px] text-subtle">{t("ov.ins.sub")}</p>
      {ins.error ? <ErrorBox error={ins.error} retry={ins.retry} /> : !ins.data ? <Skeleton className="h-40" /> : (
        <ol className="divide-y divide-line border-y border-line">
          {ins.data.map((i, n) => (
            <li key={i.investigation_id} className="grid gap-x-4 gap-y-1.5 py-3 sm:grid-cols-[110px_1fr]">
              <div className="flex items-baseline gap-2 sm:block">
                <span className="font-mono text-[11px] text-subtle">F{String(n + 1).padStart(2, "0")}</span>
                <a href={href("explorer", i.investigation_id)} className="block font-mono text-[12px] font-medium text-accent hover:underline">{i.investigation_id}</a>
              </div>
              <div className="min-w-0">
                <p className="text-[13.5px] leading-relaxed text-fg">{i.text}</p>
                <div className="mt-1"><SourceLink title={i.source_title} url={i.source_url} kind={srcs[i.source_id]?.link_kind} compact /></div>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

/** What the platform holds and what it does not, computed by the backend from loaded data. */
function DataStatus({ p, health }: { p: Provenance; health: Health | null }) {
  const { t } = useI18n();
  const n = p.records_total;
  const r = p.records_with_parameter;
  const rows: [string, string, "ok" | "warn" | "muted"][] = [
    [t("v4.ds.linked"), `${p.psi_linked} / ${p.psi_investigations}`, "ok"],
    [t("v4.ds.withTable"), `${p.psi_with_table} / ${p.psi_investigations}`, "muted"],
    [t("ov2.ds.o2"), `${r.oxygen ?? 0} / ${n}`, (r.oxygen ?? 0) < n ? "warn" : "ok"],
    [t("v4.ds.pressure"), `${r.pressure ?? 0} / ${n}`, (r.pressure ?? 0) < n ? "warn" : "ok"],
    [t("ov2.ds.air"), `${r.flow ?? 0} / ${n}`, (r.flow ?? 0) < n ? "warn" : "ok"],
    [t("v4.ds.pubDoi"), `${p.psi_publications_with_doi} / ${p.psi_publications}`, "muted"],
    [t("v4.ds.passages"), `${p.passages}`, "muted"],
    [t("ov2.ds.media"), t("common.na"), "muted"],
  ];
  return (
    <section aria-labelledby="ov-ds" className="border border-line bg-surface">
      <div className="border-b border-line px-4 py-3">
        <h2 id="ov-ds" className="text-[15px] font-semibold text-fg">{t("ov2.ds.title")}</h2>
        <p className="mt-0.5 text-[12px] text-subtle">{t("ov2.ds.sub")}</p>
      </div>
      <dl className="divide-y divide-line px-4 text-[12.5px]">
        {rows.map(([k, v, tone]) => (
          <div key={k} className="flex items-baseline justify-between gap-3 py-2">
            <dt className="text-muted">{k}</dt>
            <dd className={`shrink-0 font-mono tabular-nums ${tone === "warn" ? "text-warn" : tone === "ok" ? "text-ok" : "text-fg"}`}>{v}</dd>
          </div>
        ))}
      </dl>
      <p className="border-t border-line px-4 py-3 text-[11.5px] leading-relaxed text-subtle">
        {t("ov2.ds.note")}
        {health && <span className="mt-1.5 flex items-center gap-1.5"><i className={`h-1.5 w-1.5 ${health.llm_live ? "bg-ok" : "bg-warn"}`} aria-hidden="true" />{health.llm_live ? t("ov.hero.statusLive") : t("ov.hero.statusDemo")}</span>}
      </p>
    </section>
  );
}

/** The ten official challenge resources, with computed integration status. */
function ResourceCoverage() {
  const { t } = useI18n();
  const r = useGet<Resources>("/resources");
  return (
    <section aria-labelledby="ov-res" className="border border-line bg-surface">
      <div className="border-b border-line px-4 py-3">
        <h2 id="ov-res" className="text-[15px] font-semibold text-fg">{t("v4.ov.res")}</h2>
        <p className="mt-0.5 text-[12px] text-subtle">{t("v4.ov.resSub")}</p>
      </div>
      {r.error ? <div className="p-3"><ErrorBox error={r.error} retry={r.retry} /></div> : !r.data ? <Skeleton className="m-4 h-48" /> : (
        <ol className="divide-y divide-line">
          {r.data.resources.map((x) => (
            <li key={x.number} className="grid grid-cols-[22px_1fr] gap-x-2 px-4 py-2">
              <span className="font-mono text-[11px] text-subtle">{String(x.number).padStart(2, "0")}</span>
              <span className="min-w-0">
                <a className="block truncate text-[12.5px] text-fg hover:text-accent hover:underline" href={x.url} target="_blank" rel="noreferrer" title={x.title}>{x.title}</a>
                <span className="mt-0.5 flex flex-wrap items-center gap-1.5"><StatusBadge s={x.status} /><span className="font-mono text-[10.5px] text-subtle">{Object.values(x.stages).filter(Boolean).length}/8</span></span>
              </span>
            </li>
          ))}
        </ol>
      )}
      <a className="flex items-center gap-1 border-t border-line px-4 py-2.5 text-[12px] text-accent hover:underline" href={href("sources")}>{t("v4.ov.resAll")}<ArrowRight size={12} /></a>
    </section>
  );
}

function Tools() {
  const { t } = useI18n();
  const items: { k: Key; d: Key; to: string; I: LucideIcon }[] = [
    { k: "nav.assistant", d: "ov.flow.1", to: href("assistant", null, { q: t("as.s1") }), I: Sparkles },
    { k: "nav.compare", d: "ov.flow.2", to: href("compare", null, { ids: "BASS_001,SAFFIRE_001" }), I: GitCompareArrows },
    { k: "nav.intel", d: "ov.flow.3", to: href("intel", null, { scenario: "lunar_habitat", domain: "smoke_detection" }), I: ShieldAlert },
    { k: "nav.scenarios", d: "nav.scenarios.desc", to: href("scenarios"), I: Orbit },
    { k: "nav.graph", d: "nav.graph.desc", to: href("graph"), I: Network },
    { k: "nav.sources", d: "nav.sources.desc", to: href("sources"), I: FileSearch },
  ];
  return (
    <section aria-labelledby="ov-tools">
      <Head id="ov-tools" title={t("ov2.tools")} />
      <ul className="divide-y divide-line border-y border-line">
        {items.map(({ k, d, to, I }) => (
          <li key={k}><a href={to} className="group flex items-start gap-3 py-2.5 transition-colors hover:bg-raised">
            <I size={15} className="mt-0.5 shrink-0 text-navy" aria-hidden="true" />
            <span className="min-w-0 flex-1"><span className="block text-[13px] font-medium text-fg group-hover:text-accent">{t(k)}</span><span className="block text-[12px] leading-snug text-subtle">{t(d)}</span></span>
            <ArrowRight size={14} className="mt-0.5 shrink-0 text-subtle group-hover:text-accent" aria-hidden="true" />
          </a></li>
        ))}
      </ul>
    </section>
  );
}

export default function Overview({ health }: { health: Health | null }) {
  const { t } = useI18n();
  const ov = useGet<Ov>("/overview");
  const inv = useGet<Inv[]>("/investigations");
  const src = useGet<Source[]>("/sources");
  const srcs = Object.fromEntries((src.data ?? []).map((s) => [s.id, s]));
  const d = ov.data;

  return (
    <>
      <Intro health={health} p={d?.provenance ?? null} />
      <StatsStrip p={d?.provenance ?? null} />
      {inv.error ? <div className="mx-auto max-w-[1600px] px-4 py-12"><ErrorBox error={inv.error} retry={inv.retry} /></div> : !inv.data ? <div className="mx-auto max-w-[1600px] px-4 py-12"><Skeleton className="h-80" /></div> : <Featured invs={inv.data} />}
      <ResearchTools />
      <LunarFeature />
      {ov.error ? <div className="mx-auto max-w-[1600px] px-4 py-12"><ErrorBox error={ov.error} retry={ov.retry} /></div> : d && <DataSummary p={d.provenance} />}
    </>
  );
}
