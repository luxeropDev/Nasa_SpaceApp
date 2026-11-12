import { ArrowUpRight, Check, FileText, Link2, Plus } from "lucide-react";
import { SCENARIOS, family } from "../../api";
import type { Inv } from "../../api";
import { useI18n } from "../../i18n";
import { href } from "../../nav";

type Props = { inv: Inv; layout: "list" | "grid"; selected: boolean; onToggle: () => void; score?: number };

/** One research record in the Explorer. The whole card links to the record; the select control is separate. */
export default function ResearchCard({ inv: i, layout, selected, onToggle, score }: Props) {
  const { t, tc } = useI18n();
  const meta = (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="chip chip-accent">{i.research_domain}</span>
      <span className="chip">{tc("fuel", i.fuel_type)}</span>
      <span className="chip">{tc("sd", i.fire_safety_domain)}</span>
    </div>
  );
  const evidence = (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-subtle">
      <span className="inline-flex items-center gap-1"><FileText size={12} aria-hidden="true" />{t("ex.findings", { n: i.findings.length })}</span>
      <span className="inline-flex items-center gap-1"><Link2 size={12} aria-hidden="true" />{t("ex.sources", { n: i.source_ids.length })}</span>
      <span className="inline-flex items-center gap-1.5" title={i.relevance.map((r) => tc("scen", r)).join(", ")}>
        <span className="flex gap-0.5" aria-hidden="true">{SCENARIOS.map((s) => <i key={s} className={`h-1.5 w-3 rounded-full ${i.relevance.includes(s) ? "bg-accent" : "bg-line-strong"}`} />)}</span>
        {t("ex.scenarios", { n: i.relevance.length })}
      </span>
    </div>
  );
  const select = (
    <button type="button" onClick={onToggle} aria-pressed={selected} aria-label={selected ? t("ex.unselect", { name: i.acronym }) : t("ex.select", { name: i.acronym })}
      title={selected ? t("ex.unselect", { name: i.acronym }) : t("ex.select", { name: i.acronym })}
      className={`relative z-10 grid h-7 w-7 shrink-0 place-items-center rounded-ctl border transition-colors duration-200 ${selected ? "border-accent bg-accent text-white dark:text-[#04121c]" : "border-line-strong text-subtle hover:border-accent hover:text-accent"}`}>
      {selected ? <Check size={14} strokeWidth={2.6} /> : <Plus size={14} />}
    </button>
  );
  const head = (
    <div className="min-w-0">
      <div className="flex flex-wrap items-baseline gap-x-2">
        <a href={href("explorer", i.id)} className="text-[15px] font-semibold text-fg after:absolute after:inset-0 after:content-[''] hover:text-accent">{i.acronym}</a>
        <span className="font-mono text-[11px] text-subtle">{i.id}</span>
        {score !== undefined && <span className="font-mono text-[10.5px] text-accent" title={t("ex.bm25hint")}>BM25 {score.toFixed(2)}</span>}
      </div>
      <p className="mt-0.5 text-[13px] text-muted">{i.full_name} <span className="text-subtle">· {t("ex.program", { p: family(i.id) })}</span></p>
    </div>
  );

  if (layout === "grid") {
    return (
      <article className={`panel panel-hover group relative flex h-full flex-col gap-3 p-5 ${selected ? "!border-accent/50" : ""}`}>
        <div className="flex items-start justify-between gap-3">{head}{select}</div>
        <p className="line-clamp-3 flex-1 text-[13px] leading-relaxed text-muted">{i.objective}</p>
        {meta}
        <div className="border-t border-line pt-3">{evidence}</div>
      </article>
    );
  }
  return (
    <article className={`group relative grid gap-x-5 gap-y-2.5 px-4 py-4 transition-colors hover:bg-raised sm:px-5 md:grid-cols-[1fr_auto] ${selected ? "bg-accent/[.04]" : ""}`}>
      <div className="min-w-0 space-y-2.5">
        {head}
        <p className="line-clamp-2 max-w-3xl text-[13px] leading-relaxed text-muted">{i.objective}</p>
        {meta}
        {evidence}
      </div>
      <div className="flex items-start gap-2 md:flex-col md:items-end md:justify-between">
        {select}
        <ArrowUpRight size={16} className="hidden text-subtle transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-accent md:block" aria-hidden="true" />
      </div>
    </article>
  );
}
