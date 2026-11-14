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
    <DarkZone as="section" aria-labelledby="ov-title" className="border-b border-line">
      <div className="mx-auto grid max-w-[1440px] lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <div className="order-2 flex min-w-0 flex-col justify-center px-4 py-8 sm:px-6 lg:order-1 lg:py-12 lg:pl-8 lg:pr-10">
          <p className="eyebrow flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>{t("ov2.kicker")}</span>
            {health && <span className="text-muted">{t("ov2.dataset", { v: health.dataset_version })}</span>}
          </p>
          <h1 id="ov-title" className="mt-3 text-[32px] font-semibold leading-[1.1] tracking-tight text-fg sm:text-[40px]">{t("ov2.title")}</h1>
          <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-muted">{t("ov2.lead")}</p>
          <form role="search" className="mt-6 flex max-w-xl gap-2" onSubmit={(e) => { e.preventDefault(); go(href("explorer", null, q.trim() ? { q: q.trim() } : undefined)); }}>
            <label htmlFor="ov-q" className="sr-only">{t("ex.search.label")}</label>
            <div className="relative flex-1">
              <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-subtle" aria-hidden="true" />
              <input id="ov-q" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("ov2.search.ph")} className="input !h-11 !pl-9" autoComplete="off" />
            </div>
            <button className="btn btn-primary !h-11 !px-4">{t("ov2.search.go")}</button>
          </form>
          <p className="mt-2 text-[12px] text-subtle">{t("ov2.search.hint")}</p>
          <p className="mt-5 flex flex-wrap gap-2">
            <a className="btn btn-sm" href={href("explorer")}>{t("v4.ov.toExplorer")}<ArrowRight size={13} /></a>
            <a className="btn btn-sm btn-ghost" href={href("datasets")}>{t("v4.ov.toDatasets")}</a>
            <a className="btn btn-sm btn-ghost" href={href("sources")}>{t("v4.ov.toCoverage")}</a>
          </p>
          {p && (
            <dl className="mt-7 grid grid-cols-2 border-t border-line sm:grid-cols-4">
              {([
                ["v4.kpi.psi", p.psi_investigations],
                ["v4.kpi.rows", p.psi_table_rows.toLocaleString()],
                ["v4.kpi.doi", p.psi_publications_with_doi],
                ["v4.kpi.pages", p.document_pages],
              ] as [Key, number | string][]).map(([k, v], n) => (
                <div key={k} className={`py-3 pr-3 ${n > 0 ? "sm:border-l sm:border-line sm:pl-4" : ""} ${n % 2 ? "border-l border-line pl-4" : ""}`}>
                  <dt className="text-[11.5px] leading-snug text-subtle">{t(k)}</dt>
                  <dd className="mt-1 font-mono text-[22px] font-medium leading-none text-fg tabular-nums">{v}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
        <figure className="relative order-1 min-h-[240px] overflow-hidden bg-bg2 sm:min-h-[320px] lg:order-2 lg:min-h-[520px]">
          <picture>
            <source type="image/webp" srcSet="/media/hero-960.webp 960w, /media/hero-1600.webp 1600w, /media/hero-2400.webp 2400w" sizes="(min-width: 1024px) 58vw, 100vw" />
            <img src="/media/hero-1600.jpg" srcSet="/media/hero-960.jpg 960w, /media/hero-1600.jpg 1600w, /media/hero-2400.jpg 2400w" sizes="(min-width: 1024px) 58vw, 100vw"
              width={2400} height={1106} alt={t("v4.hero.alt")} fetchPriority="high" decoding="async" className="absolute inset-0 h-full w-full object-cover object-[62%_40%]" />
          </picture>
          <figcaption className="absolute bottom-0 right-0 max-w-full bg-bg/80 px-3 py-1.5 text-[11px] leading-snug text-muted">{t("v4.hero.caption")}</figcaption>
        </figure>
      </div>
    </DarkZone>
  );
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
  const { t, tc } = useI18n();
  const ov = useGet<Ov>("/overview");
  const inv = useGet<Inv[]>("/investigations");
  const src = useGet<Source[]>("/sources");
  const srcs = Object.fromEntries((src.data ?? []).map((s) => [s.id, s]));
  const d = ov.data;

  return (
    <>
      <Intro health={health} p={d?.provenance ?? null} />
      <div className="mx-auto grid w-full max-w-[1440px] gap-x-10 gap-y-10 px-4 pb-16 pt-8 sm:px-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:px-8">
        {/* research feed */}
        <div className="min-w-0 space-y-10">
          {inv.error ? <ErrorBox error={inv.error} retry={inv.retry} /> : !inv.data || !src.data ? <Skeleton className="h-96" /> : <Programs invs={inv.data} srcs={srcs} />}
          <Findings srcs={srcs} />
          {ov.error ? <ErrorBox error={ov.error} retry={ov.retry} /> : !d ? <Skeleton className="h-64" /> : (
            <section aria-labelledby="ov-cov" className="space-y-4">
              <Head id="ov-cov" title={t("ov.cov.title")} meta={t("ov2.cov.meta")} />
              <Panel title={t("ov.matrix.title")} sub={t("ov.matrix.sub")}>
                <Matrix cells={d.coverage_matrix} scenarios={SCENARIOS} domains={SAFETY_DOMAINS} />
              </Panel>
              <OverviewCharts byDomain={d.by_domain} byFuel={d.by_fuel} total={d.kpis.investigations} />
              <Panel title={t("ov.gaps.title")} sub={t("ov.gaps.sub")}>
                <ul className="divide-y divide-line">{d.knowledge_gaps.map((g) => (
                  <li key={g.title} className="flex gap-3 py-2.5 first:pt-0 last:pb-0"><AlertTriangle size={14} className="mt-0.5 shrink-0 text-warn" aria-hidden="true" /><div><div className="text-[13.5px] font-medium text-fg">{g.title}</div><div className="mt-0.5 text-[12.5px] leading-relaxed text-muted">{g.detail}</div></div></li>
                ))}</ul>
              </Panel>
            </section>
          )}
        </div>

        {/* narrow column: dataset status, tools, distributions */}
        <aside className="min-w-0 space-y-8" aria-label={t("ov2.aside")}>
          {d ? <DataStatus p={d.provenance} health={health} /> : <Skeleton className="h-64" />}
          <ResourceCoverage />
          <Tools />
          {d && (
            <>
              <section aria-labelledby="ov-rel">
                <Head id="ov-rel" title={t("ov.rel.title")} />
                <p className="mb-3 text-[12px] text-subtle">{t("ov.rel.sub")}</p>
                <div className="space-y-3">{d.mission_relevance.map((m) => <Meter key={m.key} value={m.count} max={d.kpis.investigations} label={m.name} count={`${m.count}/${d.kpis.investigations}`} />)}</div>
              </section>
              <section aria-labelledby="ov-sd">
                <Head id="ov-sd" title={t("ov.sd.title")} />
                <p className="mb-3 text-[12px] text-subtle">{t("ov.sd.sub")}</p>
                <div className="space-y-3">{d.by_safety_domain.map((m) => <Meter key={m.key} value={m.count} max={d.kpis.investigations} label={tc("sd", m.key)} count={m.count} tone={m.count < 3 ? "warn" : "accent"} />)}</div>
              </section>
              <section aria-labelledby="ov-use">
                <Head id="ov-use" title={t("ov.use.title")} />
                <p className="mb-3 text-[12px] text-subtle">{t("ov.use.sub")}</p>
                <div className="space-y-3">{d.source_usage.map((s) => <Meter key={s.id} value={s.findings} max={Math.max(1, ...d.source_usage.map((x) => x.findings))} label={s.title} count={s.findings} tone={s.findings === 0 ? "warn" : "accent"} />)}</div>
              </section>
            </>
          )}
          <section aria-labelledby="ov-act">
            <Head id="ov-act" title={t("ov.act.title")} />
            {d?.record_status && <p className="mb-3 text-[12.5px] leading-relaxed text-muted">{d.record_status}</p>}
            {d?.provenance.psi_ingested_at ? (
              <dl className="space-y-1.5 text-[12px]">
                <div className="flex justify-between gap-3"><dt className="text-muted">{t("v4.ov.lastPsi")}</dt><dd className="font-mono text-fg">{d.provenance.psi_ingested_at.replace("T", " ").replace("+00:00", " UTC")}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-muted">{t("v4.ov.docsIndexed")}</dt><dd className="font-mono text-fg">{d.provenance.documents}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-muted">{t("v4.ov.unlinked")}</dt><dd className="font-mono text-fg">{d.provenance.psi_unlinked.join(", ") || "—"}</dd></div>
              </dl>
            ) : <Empty compact icon={Clock} title={t("ov.act.emptyTitle")} text={t("ov.act.empty")} action={<a className="btn btn-sm" href={href("sources")}>{t("ov.act.provenance")}</a>} />}
          </section>
          <p className="font-mono text-[10.5px] leading-relaxed text-subtle">{t("ov.sys")}</p>
        </aside>
      </div>
    </>
  );
}
