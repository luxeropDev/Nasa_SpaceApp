import { useState } from "react";
import { ArrowLeft, ArrowRight, Check, ExternalLink, FileText, GitCompareArrows, Plus, Sparkles } from "lucide-react";
import { Chip, EpistemicTag, Field, NotAvailable, Panel, Skeleton, useGet } from "../components/ui";
import { ConditionsTable, DatasetMeta, EvidenceClassTag, VerificationBadge } from "../components/research/Evidence";
import type { ContextRec, DatasetFull } from "../api";
import { SourceLink } from "../components/research/SourceLink";
import { useToast } from "../components/Toast";
import { useI18n } from "../i18n";
import { href } from "../nav";
import { family } from "../api";
import type { Inv, Source } from "../api";
import { selection, useSelection } from "../selection";
import { completeness, FIELDS } from "../lib/completeness";
import { CoverageBar, StatusFlags } from "../components/research/Completeness";
import type { Key } from "../i18n";

type P = { inv: Inv; all: Inv[]; srcs: Record<string, Source> };

export default function Detail({ inv, all, srcs }: P) {
  const { t, tc } = useI18n();
  const toast = useToast();
  const selected = useSelection();
  const isSel = selected.includes(inv.id);
  const idx = all.findIndex((a) => a.id === inv.id);
  const prev = idx > 0 ? all[idx - 1] : null;
  const next = idx < all.length - 1 ? all[idx + 1] : null;
  const related = inv.related.map((r) => all.find((a) => a.id === r)).filter((x): x is Inv => !!x);
  const cmpIds = [inv.id, ...related.slice(0, 1).map((r) => r.id)].join(",");
  const allSources = Array.from(new Set([...inv.source_ids, ...inv.findings.map((f) => f.source_id)]));
  const num = (v: number | null) => (v === null ? <NotAvailable /> : v);
  const c = completeness(inv, srcs);
  const toc: [string, Key][] = [["d-findings", "det.findings"], ["d-dataset", "v4.det.dataset"], ["d-conditions", "det.conditions"], ["d-pubs", "v4.det.pubs"], ["d-docs", "v4.det.docs"], ["d-relevance", "det.relevance"], ["d-limits", "det.limits"], ["d-sources", "det.sources"], ["d-related", "det.related"], ["d-context", "v4.det.context"]];
  const ds = inv.datasets ?? [];
  const first = ds[0];

  return (
    <div className="mx-auto w-full max-w-[1440px] px-4 pb-24 pt-6 sm:px-6 md:pt-8 lg:px-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-2">
        <a className="btn btn-ghost btn-sm -ml-2" href={href("explorer")}><ArrowLeft size={14} />{t("det.back")}</a>
        <div className="flex gap-1.5">
          {prev && <a className="btn btn-sm" href={href("explorer", prev.id)} aria-label={`${t("det.prev")}: ${prev.acronym}`}><ArrowLeft size={13} />{prev.acronym}</a>}
          {next && <a className="btn btn-sm" href={href("explorer", next.id)} aria-label={`${t("det.next")}: ${next.acronym}`}>{next.acronym}<ArrowRight size={13} /></a>}
        </div>
      </div>

      <header className="mb-5 border-b border-line pb-5">
        <p className="flex flex-wrap items-center gap-2 font-mono text-[11.5px] text-subtle">
          <span className="font-medium text-accent">{inv.id}</span><span aria-hidden="true">/</span><span>{t("det.program", { p: family(inv.id) })}</span><span aria-hidden="true">/</span><span>{tc("rec", inv.record_type)}</span>
        </p>
        <div className="mt-2 grid gap-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <div className="min-w-0">
            <h1 className="font-display text-[28px] font-semibold leading-tight text-fg sm:text-[34px]">{inv.acronym} <span className="font-sans text-[18px] font-normal text-muted sm:text-[20px]">— {inv.full_name}</span></h1>
            <p className="mt-2 max-w-3xl text-[14.5px] leading-relaxed text-muted">{inv.objective}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className={`btn btn-sm ${isSel ? "btn-primary" : ""}`} onClick={() => { if (!selection.toggle(inv.id)) toast.push(t("cp.max"), "info"); }} aria-pressed={isSel}>
              {isSel ? <Check size={14} /> : <Plus size={14} />}{isSel ? t("det.selected") : t("det.select")}
            </button>
            {related.length > 0 && <a className="btn btn-sm" href={href("compare", null, { ids: cmpIds })}><GitCompareArrows size={14} />{t("det.compare")}</a>}
            <a className="btn btn-sm" href={href("reports", null, { ids: inv.id })}><FileText size={14} />{t("det.report")}</a>
            <a className="btn btn-sm" href={href("assistant", null, { q: t("det.askQ", { name: inv.acronym }) })}><Sparkles size={14} />{t("det.ask")}</a>
          </div>
        </div>
        <dl className="mt-5 grid grid-cols-2 gap-px overflow-hidden border border-line bg-line sm:grid-cols-3 xl:grid-cols-6">
          {([
            ["det2.program", <span className="font-mono">{family(inv.id)}</span>],
            ["det2.platform", first?.flight_platform ?? inv.gravity_environment],
            ["det.hardware", inv.hardware],
            ["det2.date", first && (first.start_date || first.end_date) ? <span className="font-mono">{first.start_date ?? "?"} → {first.end_date ?? "?"}<span className="block text-[10.5px] text-subtle">{t("v4.det.datesPsi")}</span></span> : <NotAvailable short />],
            ["det.domain", inv.research_domain],
            ["det2.coverage", <span className="block space-y-1"><CoverageBar c={c} /><StatusFlags c={c} max={1} /></span>],
          ] as [Key, React.ReactNode][]).map(([k, v]) => (
            <div key={k} className="bg-surface px-3 py-2.5"><dt className="text-[11px] text-subtle">{t(k)}</dt><dd className="mt-0.5 text-[12.5px] leading-snug text-fg">{v}</dd></div>
          ))}
        </dl>
      </header>

      <nav aria-label={t("det2.contents")} className="no-print sticky top-16 z-30 -mx-4 mb-6 overflow-x-auto border-b border-line bg-bg px-4 sm:-mx-6 sm:px-6 lg:top-20 lg:-mx-8 lg:px-8">
        <ul className="flex gap-1 whitespace-nowrap py-1.5 text-[12.5px]">
          {toc.map(([id, k]) => <li key={id}><a href={`#${id}`} onClick={(e) => { e.preventDefault(); document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" }); }} className="inline-flex rounded-ctl px-2.5 py-1.5 text-muted transition-colors hover:bg-hover hover:text-fg">{t(k)}</a></li>)}
        </ul>
      </nav>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="min-w-0 space-y-5 lg:col-span-2">
          <Panel id="d-findings" className="scroll-mt-28" title={t("det.findings")} sub={t("det.findingsSub")} action={<EpistemicTag kind="record" />}>
            <ol className="space-y-4">
              {inv.findings.map((f, k) => (
                <li key={f.text} className="grid grid-cols-[auto_1fr] gap-3">
                  <span className="mt-0.5 font-mono text-[11px] text-subtle">F{k + 1}</span>
                  <div className="min-w-0">
                    <p className="text-[14px] leading-relaxed text-fg">{f.text}</p>
                    <div className="mt-1.5">{srcs[f.source_id] ? <SourceLink title={srcs[f.source_id].title} url={srcs[f.source_id].url} kind={srcs[f.source_id].link_kind} compact /> : <NotAvailable short />}</div>
                  </div>
                </li>
              ))}
            </ol>
          </Panel>

          <Panel id="d-dataset" className="scroll-mt-28" title={t("v4.det.dataset")} sub={t("v4.det.datasetSub")} action={<EvidenceClassTag c="experimental_evidence" />}>
            {ds.length === 0 ? <NotAvailable /> : (
              <div className="space-y-5">
                {ds.map((d) => (
                  <div key={d.accession} className="space-y-3 border-b border-line pb-5 last:border-0 last:pb-0">
                    <p className="text-[13.5px] font-medium text-fg">{d.title}</p>
                    <DatasetMeta d={d} />
                    <div>
                      <p className="label mb-2">{t("v4.det.conditionsPsi")}</p>
                      <ConditionsTable conditions={d.conditions} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Panel>

          <Panel id="d-conditions" className="scroll-mt-28" title={t("det.conditions")} sub={t("det.conditionsSub")} action={<EpistemicTag kind="record" />}>
            <dl className="divide-y divide-line">
              <Field k={t("det.fuel")}>{tc("fuel", inv.fuel_type)}</Field>
              <Field k={t("det.material")}>{inv.fuel_material}</Field>
              <Field k={t("det.hardware")}>{inv.hardware}</Field>
              <Field k={t("det.gravity")}>{inv.gravity_environment}</Field>
              <Field k={t("det.o2")}>{num(inv.oxygen_concentration)}</Field>
              <Field k={t("det.air")}>{num(inv.airflow_speed)}</Field>
              <Field k={t("det.measure")}><span className="flex flex-wrap gap-1.5">{inv.measurement_types.map((m) => <Chip key={m}>{m}</Chip>)}</span></Field>
            </dl>
            {inv.known_conditions.length > 0 && <ul className="mt-3 list-disc space-y-1 pl-4 text-[12.5px] leading-relaxed text-muted marker:text-subtle">{inv.known_conditions.map((c) => <li key={c}>{c}</li>)}</ul>}
            <p className="mt-4 rounded-ctl border border-dashed border-line-strong px-3 py-2 font-mono text-[11px] leading-relaxed text-subtle">{t("det.numeric")}: {inv.numeric_data_status}</p>
          </Panel>

          <Publications accessions={inv.psi_accessions} />

          <Panel id="d-docs" className="scroll-mt-28" title={t("v4.det.docs")} sub={t("v4.det.docsSub")}>
            {(inv.document_mentions ?? []).length === 0 ? <p className="text-[13px] text-subtle">{t("v4.det.noMentions")}</p> : (
              <ul className="divide-y divide-line">
                {(inv.document_mentions ?? []).map((m, k) => (
                  <li key={k} className="flex flex-wrap items-baseline justify-between gap-2 py-2 text-[12.5px]">
                    <span className="min-w-0"><span className="text-fg">{m.doc_title}</span>{m.section && <span className="text-subtle"> · {m.section}</span>}</span>
                    <span className="font-mono text-[11.5px] text-muted">{m.page ? t("v4.page", { p: m.page }) : t("v4.det.article")} · {m.names.join(", ")}</span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel id="d-relevance" className="scroll-mt-28" title={t("det.relevance")} sub={t("det.relevanceSub")} action={<EpistemicTag kind="assumption" />}>
            <div className="flex flex-wrap gap-1.5">{inv.relevance.map((r) => <a key={r} className="chip transition-colors hover:border-accent/40 hover:text-accent" href={href("scenarios", null, { s: r })}>{tc("scen", r)}</a>)}</div>
            {inv.relevance_note && <p className="mt-3 text-[13px] leading-relaxed text-muted">{inv.relevance_note}</p>}
          </Panel>

          <Panel id="d-limits" className="scroll-mt-28" title={t("det.limits")} action={<EpistemicTag kind="missing" />}>
            <ul className="space-y-2.5 text-[13.5px] leading-relaxed text-muted">{inv.limitations.map((l) => <li key={l} className="flex gap-2.5"><span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-warn" aria-hidden="true" />{l}</li>)}</ul>
          </Panel>
        </div>

        <aside className="min-w-0 space-y-5">
          <Panel id="d-sources" className="scroll-mt-28" title={t("det.sources")} sub={t("det.sourcesSub")}>
            <ul className="space-y-4">
              {allSources.map((s) => {
                const x = srcs[s];
                if (!x) return <li key={s}><NotAvailable short /></li>;
                return (
                  <li key={s} className="space-y-1.5 border-b border-line pb-4 last:border-0 last:pb-0">
                    <p className="font-mono text-[11px] text-subtle">{x.id}</p>
                    <SourceLink title={x.title} url={x.url} kind={x.link_kind} />
                    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[11.5px]">
                      <dt className="text-subtle">{t("det2.publisher")}</dt><dd className="text-muted">{x.publisher}</dd>
                      <dt className="text-subtle">{t("det2.docType")}</dt><dd className="text-muted">{x.type}</dd>
                      <dt className="text-subtle">{t("det2.pubDate")}</dt><dd>{x.date ? <span className="font-mono text-muted">{x.date}</span> : <NotAvailable short />}</dd>
                      <dt className="text-subtle">{t("det2.doi")}</dt><dd>{x.doi || x.report_number ? <span className="font-mono text-muted">{x.doi ?? x.report_number}</span> : <NotAvailable short />}</dd>
                      <dt className="text-subtle">{t("v4.verification")}</dt><dd><VerificationBadge v={x.verification} /></dd>
                    </dl>
                    <p className="text-[12px] leading-relaxed text-subtle">{x.note}</p>
                  </li>
                );
              })}
            </ul>
          </Panel>
          <Panel id="d-related" className="scroll-mt-28" title={t("det.related")} sub={t("det.relatedSub")}>
            {related.length === 0 ? <p className="text-[13px] text-subtle">{t("common.none")}</p> : (
              <ul className="-mx-2 space-y-0.5">
                {related.map((r) => (
                  <li key={r.id}><a className="flex items-center justify-between gap-3 rounded-ctl px-2 py-2 transition-colors hover:bg-hover" href={href("explorer", r.id)}>
                    <span className="min-w-0"><span className="block text-[13.5px] font-medium text-fg">{r.acronym}</span><span className="block truncate text-[12px] text-subtle">{r.full_name}</span></span>
                    <ArrowRight size={14} className="shrink-0 text-subtle" /></a></li>
                ))}
              </ul>
            )}
            <a className="mt-3 inline-flex text-[12.5px] text-accent hover:underline" href={href("graph", null, { focus: inv.id })}>{t("det.inGraph")}</a>
          </Panel>
          <RelatedContext id={inv.id} />
          <Panel title={t("det2.dc.title")} sub={t("det2.dc.sub")}>
            <ul className="divide-y divide-line text-[12.5px]">
              {FIELDS.map((f) => {
                const ok = c.present.includes(f);
                return <li key={f} className="flex items-center justify-between gap-3 py-1.5"><span className="text-muted">{t(`dc.field.${f}` as Key)}</span>{ok ? <span className="font-mono text-[11px] text-ok">{t("det2.stored")}</span> : <NotAvailable short />}</li>;
              })}
            </ul>
            <div className="mt-3 border-t border-line pt-3"><StatusFlags c={c} max={4} /></div>
          </Panel>
        </aside>
      </div>
    </div>
  );
}

/** Publications listed by PSI for the linked dataset(s), with DOIs exactly as PSI lists them. Loaded on demand. */
function Publications({ accessions }: { accessions: string[] }) {
  const { t } = useI18n();
  const [all, setAll] = useState(false);
  const d = useGet<DatasetFull>(accessions[0] ? `/datasets/${accessions[0]}` : null);
  const pubs = d.data?.publications ?? [];
  return (
    <Panel id="d-pubs" className="scroll-mt-28" title={t("v4.det.pubs")} sub={t("v4.det.pubsSub", { acc: accessions[0] ?? "—" })}>
      {!accessions.length ? <NotAvailable /> : d.error ? <NotAvailable /> : !d.data ? <Skeleton className="h-24" /> : pubs.length === 0 ? <p className="text-[13px] text-subtle">{t("common.none")}</p> : (
        <>
          <ol className="space-y-2.5">
            {(all ? pubs : pubs.slice(0, 6)).map((p, k) => (
              <li key={k} className="grid grid-cols-[28px_1fr] gap-2 text-[12.5px]">
                <span className="font-mono text-[11px] text-subtle">{k + 1}.</span>
                <span className="min-w-0"><span className="text-fg">{p.title}</span>
                  <span className="block text-subtle">{p.authors ?? t("common.na")}{p.doi ? <> · <a className="font-mono text-accent hover:underline" href={`https://doi.org/${p.doi}`} target="_blank" rel="noreferrer">DOI {p.doi}</a></> : <> · <span className="font-mono">{t("v4.noDoi")}</span></>}</span>
                </span>
              </li>
            ))}
          </ol>
          {pubs.length > 6 && <button className="btn btn-ghost btn-sm mt-2" onClick={() => setAll(!all)}>{all ? t("v4.showLess") : t("v4.showAll", { n: pubs.length })}</button>}
          <p className="mt-3 text-[11px] text-subtle">{t("v4.det.pubsNote")}</p>
        </>
      )}
    </Panel>
  );
}

/** Historical incidents / technology-transfer cases curated as topically related. Clearly not experimental evidence. */
function RelatedContext({ id }: { id: string }) {
  const { t } = useI18n();
  const c = useGet<ContextRec[]>("/context");
  const rel = (c.data ?? []).filter((x) => x.related_investigations.includes(id));
  return (
    <Panel id="d-context" className="scroll-mt-28" title={t("v4.det.context")} sub={t("v4.ctx.notEvidence")}>
      {!c.data ? <Skeleton className="h-16" /> : rel.length === 0 ? <p className="text-[13px] text-subtle">{t("common.none")}</p> : (
        <ul className="space-y-3">
          {rel.map((x) => (
            <li key={x.id} className="space-y-1">
              <p className="flex flex-wrap items-center gap-2"><EvidenceClassTag c={x.kind} /><span className="font-mono text-[11px] text-subtle">{x.year}</span></p>
              <p className="text-[13px] font-medium text-fg">{x.title}</p>
              <p className="text-[12px] leading-relaxed text-muted">{x.relevance}</p>
              <a className="inline-flex items-center gap-1 text-[11.5px] text-accent hover:underline" href={x.source.url} target="_blank" rel="noreferrer">{x.source.title}<ExternalLink size={10} /></a>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
