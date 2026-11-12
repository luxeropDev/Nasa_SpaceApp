import { AlertTriangle, ArrowRight, BookOpen, CircleSlash, FlaskConical, Info, Layers } from "lucide-react";
import { SCENARIOS } from "../api";
import type { ScenarioMap } from "../api";
import { useGet, ErrorBox, Page, PageSkeleton, Panel, EpistemicTag, Empty } from "../components/ui";
import { SourceLink } from "../components/research/SourceLink";
import { useI18n } from "../i18n";
import { go, href } from "../nav";

/** Mission scenario research mapping — evidence organisation, never a fire simulation. */
export default function Scenarios({ params }: { params: URLSearchParams }) {
  const { t, tc } = useI18n();
  const data = useGet<ScenarioMap[]>("/scenarios");
  const key = (SCENARIOS as readonly string[]).includes(params.get("s") ?? "") ? params.get("s")! : "iss";

  const wrap = (c: React.ReactNode) => <Page eyebrow={t("sc.eyebrow")} title={t("sc.title")} sub={t("sc.sub")}>{c}</Page>;
  if (data.error) return wrap(<ErrorBox error={data.error} retry={data.retry} />);
  if (!data.data) return wrap(<PageSkeleton />);
  const all = data.data;
  const s = all.find((x) => x.key === key) ?? all[0];
  const maxCov = Math.max(1, ...s.domain_coverage.map((c) => c.count));

  return (
    <Page eyebrow={t("sc.eyebrow")} title={t("sc.title")} sub={t("sc.sub")}>
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4" role="tablist" aria-label={t("sc.select")}>
        {all.map((x, n) => {
          const on = x.key === s.key;
          return (
            <button key={x.key} role="tab" aria-selected={on} onClick={() => go(href("scenarios", null, { s: x.key }))}
              className={`group relative overflow-hidden rounded-card border p-4 text-left transition-colors duration-200 ${on ? "border-fg/60 bg-surface" : "border-line bg-surface/50 hover:border-line-strong hover:bg-surface"}`}>
              <span className="font-mono text-[10.5px] text-subtle">0{n + 1}</span>
              <span className={`mt-2 block text-[14px] font-semibold leading-tight ${on ? "text-fg" : "text-muted group-hover:text-fg"}`}>{tc("scen", x.key)}</span>
              <span className="mt-2 block text-[11.5px] text-subtle">{t("sc.tabMeta", { n: x.investigations.length, d: 4 - x.missing_domains.length })}</span>
              {on && <span className="absolute inset-x-0 bottom-0 h-0.5 bg-brand" aria-hidden="true" />}
            </button>
          );
        })}
      </div>

      <div className="flex gap-3 rounded-card border border-accent/25 bg-accent/[.05] p-4 text-[13px] leading-relaxed text-muted" role="note">
        <Info size={17} className="mt-0.5 shrink-0 text-accent" aria-hidden="true" />
        <p><b className="font-semibold text-fg">{t("sc.notSim")}</b> {t("sc.notSimBody")}</p>
      </div>

      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-card border border-line bg-line lg:grid-cols-4">
        {([
          [t("sc.k.records"), s.investigations.length, Layers],
          [t("sc.k.domains"), `${4 - s.missing_domains.length}/4`, FlaskConical],
          [t("sc.k.sources"), s.sources.length, BookOpen],
          [t("sc.k.numeric"), s.numeric_measurements === 0 ? t("sc.k.none") : s.numeric_measurements, CircleSlash],
        ] as const).map(([l, v, I]) => (
          <div key={l} className="bg-surface p-4">
            <dt className="flex items-center gap-1.5 text-[12px] text-subtle"><I size={13} aria-hidden="true" />{l}</dt>
            <dd className="mt-2 text-[26px] font-light leading-none tracking-tight text-fg tabular-nums">{v}</dd>
          </div>
        ))}
      </dl>

      <div className="grid gap-5 lg:grid-cols-5">
        <Panel className="lg:col-span-2" title={t("sc.coverage")} sub={t("sc.coverageSub")} action={<EpistemicTag kind="derived" />}>
          <ul className="space-y-3">
            {s.domain_coverage.map((c) => (
              <li key={c.domain}>
                <a href={href("intel", null, { scenario: s.key, domain: c.domain })} className="group block rounded-ctl p-1 -m-1 transition-colors hover:bg-hover/50">
                  <div className="mb-1.5 flex items-baseline justify-between gap-2 text-[13px]">
                    <span className="text-fg">{tc("sd", c.domain)}</span>
                    <span className={`font-mono text-[11.5px] ${c.count ? "text-muted" : "text-warn"}`}>{c.count ? t("sc.records", { n: c.count }) : t("sc.gap")}</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-raised">{c.count > 0 ? <div className="bar-grow h-full rounded-full bg-accent" style={{ width: `${(c.count / maxCov) * 100}%` }} /> : <div className="h-full w-full border border-dashed border-warn/60" />}</div>
                </a>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-[12px] text-subtle">{t("sc.coverageLink")}</p>
          {s.research_domains.length > 0 && (
            <div className="mt-4 border-t border-line pt-3">
              <p className="label mb-2">{t("sc.researchDomains")}</p>
              <div className="flex flex-wrap gap-1.5">{s.research_domains.map((d) => <span key={d} className="chip">{d}</span>)}</div>
            </div>
          )}
        </Panel>

        <Panel className="lg:col-span-3" title={t("sc.missing")} sub={t("sc.missingSub")} action={<EpistemicTag kind="missing" />}>
          <ul className="space-y-3 text-[13px] leading-relaxed text-muted">
            {s.missing_domains.map((d) => <li key={d} className="flex gap-2.5"><CircleSlash size={14} className="mt-1 shrink-0 text-warn" />{t("sc.noRecords", { domain: tc("sd", d) })}</li>)}
            {s.knowledge_gaps.map((g) => <li key={g} className="flex gap-2.5"><AlertTriangle size={14} className="mt-1 shrink-0 text-warn" />{g}</li>)}
          </ul>
        </Panel>
      </div>

      <Panel title={t("sc.evidence")} sub={t("sc.evidenceSub")}>
        {s.investigations.length === 0 ? <Empty compact icon={Layers} text={t("sc.noEvidence")} /> : (
          <ul className="divide-y divide-line">
            {s.investigations.map((i) => (
              <li key={i.id} className="grid gap-x-6 gap-y-2 py-4 first:pt-0 last:pb-0 md:grid-cols-[180px_1fr]">
                <div>
                  <a href={href("explorer", i.id)} className="text-[14px] font-semibold text-fg hover:text-accent">{i.acronym}</a>
                  <p className="font-mono text-[10.5px] text-subtle">{i.id}</p>
                  <p className="mt-1.5 flex flex-wrap gap-1"><span className="chip !text-[10.5px]">{tc("sd", i.fire_safety_domain)}</span><span className="chip !text-[10.5px]">{tc("fuel", i.fuel_type)}</span></p>
                </div>
                <div className="min-w-0 space-y-2">
                  {i.finding && (
                    <div>
                      <div className="mb-1 flex items-center gap-2"><EpistemicTag kind="record" /></div>
                      <p className="text-[13.5px] leading-relaxed text-fg">{i.finding.text}</p>
                      {(() => { const src = s.sources.find((x) => x.id === i.finding!.source_id); return src ? <div className="mt-1"><SourceLink title={src.title} url={src.url} kind={src.link_kind} compact /></div> : null; })()}
                    </div>
                  )}
                  {i.relevance_note && (
                    <p className="flex flex-wrap items-start gap-2 text-[12.5px] leading-relaxed text-muted"><EpistemicTag kind="assumption" /><span className="min-w-0 flex-1">{i.relevance_note}</span></p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title={t("sc.limits")} sub={t("sc.limitsSub")}>
          <ul className="space-y-2.5 text-[13px] leading-relaxed text-muted">{s.limitations.map((l) => <li key={l} className="flex gap-2.5"><span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-warn" aria-hidden="true" />{l}</li>)}</ul>
        </Panel>
        <Panel title={t("sc.sources")} sub={t("sc.sourcesSub")}>
          <ul className="space-y-2.5">{s.sources.map((x) => <li key={x.id}><SourceLink title={x.title} url={x.url} kind={x.link_kind} compact /></li>)}</ul>
          <a className="mt-4 inline-flex items-center gap-1 text-[12.5px] text-accent hover:underline" href={href("reports", null, { ids: s.investigations.slice(0, 4).map((i) => i.id).join(",") })}>{t("sc.toReport")}<ArrowRight size={12} /></a>
        </Panel>
      </div>
    </Page>
  );
}
