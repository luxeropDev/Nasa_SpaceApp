import { ExternalLink } from "lucide-react";
import type { Condition, DatasetCard, EvidenceClass, ResourceStatus } from "../../api";
import { useI18n } from "../../i18n";
import type { Key } from "../../i18n";

/** Category of a source. Historical incidents and technology transfer are never styled like experimental evidence. */
export function EvidenceClassTag({ c }: { c: EvidenceClass | string }) {
  const { t } = useI18n();
  const tone = c === "experimental_evidence" ? "chip-accent" : c === "scientific_publication" ? "chip-ok" : c === "historical_incident" ? "chip-warn" : "";
  return <span className={`chip ${tone}`}>{t(`v4.ec.${c}` as Key)}</span>;
}

export type ClaimType = "EVIDENCE" | "INTERPRETATION" | "HYPOTHESIS" | "SAFETY";
const CLAIM_TONE: Record<ClaimType, string> = {
  EVIDENCE: "border-accent/40 bg-accent/10 text-accent",
  INTERPRETATION: "border-line-strong bg-raised text-muted",
  HYPOTHESIS: "border-warn/40 bg-warn/10 text-warn",
  SAFETY: "border-brand/40 bg-brand/10 text-brand",
};
/** Epistemic status of one statement in an answer. */
export function ClaimTag({ type }: { type: ClaimType }) {
  const { t } = useI18n();
  return <span className={`inline-flex shrink-0 items-center rounded-[3px] border px-1.5 py-px font-mono text-[10px] font-medium tracking-[.06em] ${CLAIM_TONE[type]}`} title={t(`v4.claim.${type}.hint` as Key)}>{t(`v4.claim.${type}` as Key)}</span>;
}

/** How a quoted text relates to its source: verbatim excerpt vs. curated paraphrase. */
export function VerificationBadge({ v }: { v: string }) {
  const { t } = useI18n();
  const tone = v.startsWith("verbatim") || v === "verified_accessible" ? "chip-ok" : v === "curated_summary" ? "chip-warn" : "";
  return <span className={`chip ${tone}`} title={t(`v4.ver.${v}.hint` as Key)}>{t(`v4.ver.${v}` as Key)}</span>;
}

const STATUS_TONE: Record<ResourceStatus, string> = {
  FULLY_INTEGRATED: "chip-ok", PARTIALLY_INTEGRATED: "chip-accent", LINK_ONLY: "chip-warn", NOT_INTEGRATED: "chip-danger", UNAVAILABLE: "chip-danger", REQUIRES_VERIFICATION: "chip-warn",
};
export function StatusBadge({ s }: { s: ResourceStatus }) {
  const { t } = useI18n();
  return <span className={`chip font-mono !text-[10.5px] ${STATUS_TONE[s]}`}>{t(`v4.st.${s}` as Key)}</span>;
}

/** A citation with every provenance field that exists; absent fields are omitted, never invented. */
export function CitationBlock({ title, org, year, url, doi, page, section, excerpt, verification, id }: {
  title: string; org?: string | null; year?: string | number | null; url?: string | null; doi?: string | null; page?: number | null; section?: string | null;
  excerpt?: string; verification?: string; id?: string;
}) {
  const { t } = useI18n();
  return (
    <figure className="border-l-2 border-line-strong pl-3">
      {excerpt && <blockquote className="text-[13px] leading-relaxed text-fg">{excerpt}</blockquote>}
      <figcaption className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11.5px] text-subtle">
        {id && <span className="font-mono text-fg">[{id}]</span>}
        {url ? <a className="inline-flex items-center gap-1 text-accent hover:underline" href={url} target="_blank" rel="noreferrer">{title}<ExternalLink size={10} /></a> : <span className="text-fg">{title}</span>}
        {org && <span>· {org}</span>}
        {year && <span className="font-mono">· {year}</span>}
        {page && <span className="font-mono">· {t("v4.page", { p: page })}</span>}
        {section && <span>· {section}</span>}
        {doi && <a className="font-mono text-accent hover:underline" href={`https://doi.org/${doi}`} target="_blank" rel="noreferrer">DOI {doi}</a>}
        {verification && <VerificationBadge v={verification} />}
      </figcaption>
    </figure>
  );
}

const fmt = (x: number) => (Math.abs(x) >= 1000 || Number.isInteger(x) ? String(x) : x.toPrecision(4).replace(/\.?0+$/, ""));

/** Per-test conditions as published in PSI experiment tables: original header (unit), range, filled rows. */
export function ConditionsTable({ conditions, params }: { conditions: Condition[]; params?: Condition["parameter"][] }) {
  const { t } = useI18n();
  const rows = params ? conditions.filter((c) => params.includes(c.parameter)) : conditions;
  if (!rows.length) return <p className="text-[12.5px] text-subtle">{t("v4.cond.none")}</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[520px] text-left text-[12.5px]">
        <thead className="border-b border-line text-[11px] text-subtle">
          <tr><th scope="col" className="py-1.5 pr-3 font-medium">{t("v4.cond.param")}</th><th scope="col" className="py-1.5 pr-3 font-medium">{t("v4.cond.column")}</th><th scope="col" className="py-1.5 pr-3 font-medium">{t("v4.cond.range")}</th><th scope="col" className="py-1.5 text-right font-medium">{t("v4.cond.rows")}</th></tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((c, k) => (
            <tr key={k} className="align-top">
              <td className="py-1.5 pr-3 text-muted">{t(`v4.param.${c.parameter}` as Key)}</td>
              <td className="py-1.5 pr-3 font-mono text-[11.5px] text-fg">{c.column}</td>
              <td className="py-1.5 pr-3 font-mono text-[11.5px] tabular-nums text-fg">{c.kind === "numeric" && c.min !== undefined && c.max !== undefined ? (c.min === c.max ? fmt(c.min) : `${fmt(c.min)} – ${fmt(c.max)}`) : (c.examples ?? []).slice(0, 4).join("; ")}</td>
              <td className="py-1.5 text-right font-mono text-[11.5px] tabular-nums text-subtle">{c.filled_rows}/{c.total_rows}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-[11px] leading-relaxed text-subtle">{t("v4.cond.note")}</p>
    </div>
  );
}

/** Identity block of one PSI dataset. */
export function DatasetMeta({ d }: { d: DatasetCard }) {
  const { t } = useI18n();
  const na = <span className="text-subtle">{t("common.na")}</span>;
  const rows: [Key, React.ReactNode][] = [
    ["v4.ds.accession", <a className="font-mono text-accent hover:underline" href={d.landing_url} target="_blank" rel="noreferrer">{d.accession}</a>],
    ["v4.ds.doi", d.doi ? <a className="font-mono text-accent hover:underline" href={`https://doi.org/${d.doi}`} target="_blank" rel="noreferrer">{d.doi}</a> : na],
    ["v4.ds.type", d.project_type ?? na],
    ["v4.ds.platform", d.flight_platform ?? na],
    ["v4.ds.center", d.nasa_center ?? na],
    ["v4.ds.dates", d.start_date || d.end_date ? <span className="font-mono">{d.start_date ?? "?"} → {d.end_date ?? "?"}</span> : na],
    ["v4.ds.hardware", d.hardware ?? na],
    ["v4.ds.release", d.release_date ? <span className="font-mono">{d.release_date} · v{d.version}</span> : na],
    ["v4.ds.license", d.license ? <span className="font-mono">{d.license}</span> : na],
    ["v4.ds.table", d.experiment_rows ? <span className="font-mono">{t("v4.ds.tableRows", { r: d.experiment_rows, c: d.experiment_columns })}</span> : na],
    ["v4.ds.pubs", <span className="font-mono">{d.publication_count}</span>],
  ];
  return (
    <dl className="grid gap-x-4 gap-y-1.5 text-[12.5px] sm:grid-cols-[150px_1fr]">
      {rows.map(([k, v]) => <div key={k} className="contents"><dt className="text-subtle">{t(k)}</dt><dd className="min-w-0 break-words text-fg">{v}</dd></div>)}
    </dl>
  );
}
