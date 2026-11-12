import { ArrowLeft, ArrowRight, Check, FileText, GitCompareArrows, Plus, Sparkles } from "lucide-react";
import { Chip, EpistemicTag, Field, NotAvailable, Panel } from "../components/ui";
import { SourceLink } from "../components/research/SourceLink";
import { useToast } from "../components/Toast";
import { useI18n } from "../i18n";
import { href } from "../nav";
import { family } from "../api";
import type { Inv, Source } from "../api";
import { selection, useSelection } from "../selection";

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

  return (
    <div className="mx-auto w-full max-w-[1440px] px-4 pb-24 pt-6 sm:px-6 md:pt-8 lg:px-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-2">
        <a className="btn btn-ghost btn-sm -ml-2" href={href("explorer")}><ArrowLeft size={14} />{t("det.back")}</a>
        <div className="flex gap-1.5">
          {prev && <a className="btn btn-sm" href={href("explorer", prev.id)} aria-label={`${t("det.prev")}: ${prev.acronym}`}><ArrowLeft size={13} />{prev.acronym}</a>}
          {next && <a className="btn btn-sm" href={href("explorer", next.id)} aria-label={`${t("det.next")}: ${next.acronym}`}>{next.acronym}<ArrowRight size={13} /></a>}
        </div>
      </div>

      <header className="mb-8 grid gap-6 lg:grid-cols-[1fr_auto] lg:items-end">
        <div className="min-w-0">
          <p className="reveal flex flex-wrap items-center gap-2 font-mono text-[11px] uppercase tracking-[.16em] text-subtle">
            <span className="text-brand">{t("det.program", { p: family(inv.id) })}</span><span aria-hidden="true">/</span><span>{inv.id}</span>
          </p>
          <h1 className="reveal d-1 mt-3 text-[30px] font-semibold leading-[1.08] tracking-[-0.03em] text-fg sm:text-[40px]">{inv.acronym}<span className="block text-[18px] font-normal tracking-tight text-muted sm:text-[22px]">{inv.full_name}</span></h1>
          <p className="reveal d-2 mt-4 max-w-3xl text-[15px] leading-relaxed text-muted">{inv.objective}</p>
          <div className="reveal d-3 mt-4 flex flex-wrap gap-1.5">
            <Chip tone="accent">{inv.research_domain}</Chip><Chip>{tc("fuel", inv.fuel_type)}</Chip><Chip>{tc("sd", inv.fire_safety_domain)}</Chip><Chip tone="warn">{tc("rec", inv.record_type)}</Chip>
          </div>
        </div>
        <div className="reveal d-3 flex flex-wrap gap-2">
          <button className={`btn-cut-sm ${isSel ? "btn-cut" : "btn-cut-border"}`} onClick={() => { if (!selection.toggle(inv.id)) toast.push(t("cp.max"), "info"); }} aria-pressed={isSel}>
            {isSel ? <Check size={14} /> : <Plus size={14} />}{isSel ? t("det.selected") : t("det.select")}
          </button>
          {related.length > 0 && <a className="btn" href={href("compare", null, { ids: cmpIds })}><GitCompareArrows size={14} />{t("det.compare")}</a>}
          <a className="btn" href={href("reports", null, { ids: inv.id })}><FileText size={14} />{t("det.report")}</a>
          <a className="btn" href={href("assistant", null, { q: t("det.askQ", { name: inv.acronym }) })}><Sparkles size={14} />{t("det.ask")}</a>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="min-w-0 space-y-5 lg:col-span-2">
          <Panel title={t("det.findings")} sub={t("det.findingsSub")} action={<EpistemicTag kind="record" />}>
            <ol className="space-y-4">
              {inv.findings.map((f, k) => (
                <li key={f.text} className="grid grid-cols-[auto_1fr] gap-3">
                  <span className="mt-0.5 font-mono text-[11px] text-brand">F{k + 1}</span>
                  <div className="min-w-0">
                    <p className="text-[14px] leading-relaxed text-fg">{f.text}</p>
                    <div className="mt-1.5">{srcs[f.source_id] ? <SourceLink title={srcs[f.source_id].title} url={srcs[f.source_id].url} kind={srcs[f.source_id].link_kind} compact /> : <NotAvailable short />}</div>
                  </div>
                </li>
              ))}
            </ol>
          </Panel>

          <Panel title={t("det.conditions")} sub={t("det.conditionsSub")} action={<EpistemicTag kind="record" />}>
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

          <Panel title={t("det.relevance")} sub={t("det.relevanceSub")} action={<EpistemicTag kind="assumption" />}>
            <div className="flex flex-wrap gap-1.5">{inv.relevance.map((r) => <a key={r} className="chip transition-colors hover:border-accent/40 hover:text-accent" href={href("scenarios", null, { s: r })}>{tc("scen", r)}</a>)}</div>
            {inv.relevance_note && <p className="mt-3 text-[13px] leading-relaxed text-muted">{inv.relevance_note}</p>}
          </Panel>

          <Panel title={t("det.limits")} action={<EpistemicTag kind="missing" />}>
            <ul className="space-y-2.5 text-[13.5px] leading-relaxed text-muted">{inv.limitations.map((l) => <li key={l} className="flex gap-2.5"><span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-warn" aria-hidden="true" />{l}</li>)}</ul>
          </Panel>
        </div>

        <aside className="min-w-0 space-y-5">
          <Panel title={t("det.sources")} sub={t("det.sourcesSub")}>
            <ul className="space-y-4">
              {allSources.map((s) => {
                const x = srcs[s];
                if (!x) return <li key={s}><NotAvailable short /></li>;
                return (
                  <li key={s} className="space-y-1">
                    <p className="font-mono text-[10.5px] text-subtle">{x.id} · {x.publisher}</p>
                    <SourceLink title={x.title} url={x.url} kind={x.link_kind} />
                    <p className="text-[12px] leading-relaxed text-subtle">{x.note}</p>
                  </li>
                );
              })}
            </ul>
          </Panel>
          <Panel title={t("det.related")} sub={t("det.relatedSub")}>
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
          <Panel title={t("det.facts")}>
            <dl className="divide-y divide-line text-[12.5px]">
              <div className="flex justify-between gap-3 py-2"><dt className="text-subtle">{t("det.domain")}</dt><dd className="text-right text-fg">{inv.research_domain}</dd></div>
              <div className="flex justify-between gap-3 py-2"><dt className="text-subtle">{t("det.fsd")}</dt><dd className="text-right text-fg">{tc("sd", inv.fire_safety_domain)}</dd></div>
              <div className="flex justify-between gap-3 py-2"><dt className="text-subtle">{t("det.recordType")}</dt><dd className="text-right font-mono text-fg">{inv.record_type}</dd></div>
            </dl>
          </Panel>
        </aside>
      </div>
    </div>
  );
}
