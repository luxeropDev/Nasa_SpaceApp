import { Check, FileText, Link2, Plus } from "lucide-react";
import { SCENARIOS, family } from "../../api";
import type { Inv, SearchWhy } from "../../api";
import type { Completeness } from "../../lib/completeness";
import { useI18n } from "../../i18n";
import type { Key } from "../../i18n";
import { href } from "../../nav";
import { CoverageBar, StatusFlags } from "./Completeness";

type Props = { inv: Inv; layout: "list" | "grid"; selected: boolean; onToggle: () => void; score?: number; c: Completeness; why?: SearchWhy };

/** "Why it matched": the fields in which query terms were found, plus any exact identifier hit. */
export function MatchWhy({ why }: { why: SearchWhy }) {
  const { t } = useI18n();
  const fields = Object.entries(why.fields);
  if (!fields.length && !why.exact_identifier) return null;
  return (
    <p className="relative z-10 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11.5px] text-subtle">
      <span className="font-medium text-muted">{t("v4.why")}</span>
      {why.exact_identifier && <span className="chip chip-accent font-mono">{t("v4.why.exact", { id: why.exact_identifier })}</span>}
      {fields.slice(0, 5).map(([f, terms]) => (
        <span key={f} className="inline-flex items-center gap-1"><span>{t(`v4.field.${f}` as Key)}:</span><span className="font-mono text-fg">{terms.slice(0, 3).join(", ")}</span></span>
      ))}
    </p>
  );
}

/** One research record in the catalog. The title links to the dossier; the select control is separate. */
export default function ResearchCard({ inv: i, layout, selected, onToggle, score, c, why }: Props) {
  const { t, tc } = useI18n();
  const select = (
    <button type="button" onClick={onToggle} aria-pressed={selected} aria-label={selected ? t("ex.unselect", { name: i.acronym }) : t("ex.select", { name: i.acronym })}
      title={selected ? t("ex.unselect", { name: i.acronym }) : t("ex.select", { name: i.acronym })}
      className={`relative z-10 grid h-6 w-6 shrink-0 place-items-center rounded-[3px] border transition-colors duration-150 ${selected ? "border-accent bg-accent text-on-accent" : "border-line-strong text-subtle hover:border-accent hover:text-accent"}`}>
      {selected ? <Check size={13} strokeWidth={2.6} /> : <Plus size={13} />}
    </button>
  );
  const counts = (
    <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-subtle">
      <span className="inline-flex items-center gap-1"><FileText size={12} aria-hidden="true" />{t("ex.findings", { n: i.findings.length })}</span>
      <span className="inline-flex items-center gap-1"><Link2 size={12} aria-hidden="true" />{t("ex.sources", { n: i.source_ids.length })}</span>
      {i.psi_accessions.length > 0 && <span className="font-mono text-[11px] text-muted" title={t("v4.psiLinked")}>{i.psi_accessions.join(" · ")}</span>}
      <span className="inline-flex items-center gap-1.5" title={i.relevance.map((r) => tc("scen", r)).join(", ")}>
        <span className="flex gap-px" aria-hidden="true">{SCENARIOS.map((s) => <i key={s} className={`h-2 w-2.5 ${i.relevance.includes(s) ? "bg-navy/70" : "bg-line-strong/60"}`} />)}</span>
        {t("ex.scenarios", { n: i.relevance.length })}
      </span>
    </span>
  );
  const title = (
    <a href={href("explorer", i.id)} className="text-[15px] font-semibold text-fg after:absolute after:inset-0 after:content-[''] hover:text-accent">{i.acronym}</a>
  );

  if (layout === "grid") {
    return (
      <article className={`group relative flex h-full flex-col gap-2.5 border bg-surface p-4 transition-colors hover:bg-raised ${selected ? "border-accent" : "border-line"}`}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-mono text-[11.5px] text-accent">{i.id}</p>
            <p className="mt-0.5">{title}</p>
            <p className="text-[12.5px] text-muted">{i.full_name}</p>
          </div>
          {select}
        </div>
        <p className="line-clamp-3 flex-1 text-[13px] leading-relaxed text-muted">{i.objective}</p>
        {why && <MatchWhy why={why} />}
        <p className="text-[12px] text-subtle">{i.research_domain} · {tc("fuel", i.fuel_type)} · {tc("sd", i.fire_safety_domain)}</p>
        <div className="space-y-1.5 border-t border-line pt-2.5"><CoverageBar c={c} />{counts}</div>
      </article>
    );
  }
  return (
    <article className={`group relative grid gap-x-6 gap-y-2 px-4 py-3.5 transition-colors hover:bg-raised md:grid-cols-[120px_minmax(0,1fr)_220px_auto] ${selected ? "bg-accent/[.05]" : ""}`}>
      <div className="flex items-baseline gap-2 md:block">
        <p className="font-mono text-[12px] font-medium text-accent">{i.id}</p>
        <p className="font-mono text-[10.5px] uppercase text-subtle">{t("ex.program", { p: family(i.id) })}</p>
        {score !== undefined && <p className="font-mono text-[10.5px] text-subtle md:mt-1" title={t("ex.bm25hint")}>{t("v4.score")} {score.toFixed(1)}</p>}
      </div>
      <div className="min-w-0 space-y-1.5">
        <h3 className="leading-tight">{title} <span className="text-[13px] font-normal text-muted">— {i.full_name}</span></h3>
        <p className="line-clamp-2 max-w-3xl text-[13px] leading-relaxed text-muted">{i.objective}</p>
        <p className="text-[12px] text-subtle">{i.research_domain} · {tc("fuel", i.fuel_type)} · {tc("sd", i.fire_safety_domain)}</p>
        {counts}
        {why && <MatchWhy why={why} />}
      </div>
      <dl className="space-y-1 text-[12px]">
        <div><dt className="sr-only">{t("ov2.col.platform")}</dt><dd className="text-muted">{i.hardware}<span className="block text-subtle">{i.gravity_environment}</span></dd></div>
        <div className="pt-1"><dt className="sr-only">{t("ov2.col.data")}</dt><dd><CoverageBar c={c} /><span className="mt-1 block"><StatusFlags c={c} max={3} /></span></dd></div>
      </dl>
      <div className="flex items-start md:justify-end">{select}</div>
    </article>
  );
}
