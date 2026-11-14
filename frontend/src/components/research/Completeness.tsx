import type { Completeness as C, Flag } from "../../lib/completeness";
import { FIELDS } from "../../lib/completeness";
import { useI18n } from "../../i18n";
import type { Key } from "../../i18n";

const TONE: Record<Flag, string> = { complete: "text-ok", partial: "text-warn", noNumeric: "text-muted", verify: "text-muted", qualitative: "text-muted", psiTable: "text-ok" };

/** Segmented field-coverage bar: one cell per schema field, filled when the record stores a value. */
export function CoverageBar({ c, className = "" }: { c: C; className?: string }) {
  const { t } = useI18n();
  const label = t("dc.coverage", { n: c.present.length, total: FIELDS.length });
  return (
    <span className={`inline-flex items-center gap-2 ${className}`} title={label}>
      <span className="flex gap-[2px]" role="img" aria-label={label}>
        {FIELDS.map((f) => <i key={f} className={`h-2.5 w-1.5 ${c.present.includes(f) ? "bg-navy/80" : "border border-dashed border-line-strong"}`} />)}
      </span>
      <span className="font-mono text-[11px] tabular-nums text-subtle">{c.present.length}/{FIELDS.length}</span>
    </span>
  );
}

/** Restrained status labels. Limitations are research constraints, not errors, so they are never red. */
export function StatusFlags({ c, max = 3 }: { c: C; max?: number }) {
  const { t } = useI18n();
  return (
    <span className="flex flex-wrap gap-x-3 gap-y-1">
      {c.flags.slice(0, max).map((f) => (
        <span key={f} className={`inline-flex items-center gap-1.5 text-[11.5px] ${TONE[f]}`} title={t(`dc.flag.${f}.hint` as Key)}>
          <i className={`h-1.5 w-1.5 ${f === "complete" || f === "psiTable" ? "bg-ok" : f === "partial" ? "bg-warn" : "bg-subtle"}`} aria-hidden="true" />{t(`dc.flag.${f}` as Key)}
        </span>
      ))}
    </span>
  );
}
