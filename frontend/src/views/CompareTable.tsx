import { Check, CircleDashed, Equal, GitCompareArrows } from "lucide-react";
import { Chip, Panel } from "../components/ui";
import { useI18n } from "../i18n";
import type { Key } from "../i18n";

export type Val = string | number | string[] | null;
export type Row = { key: string; label: string; values: Val[]; status: "same" | "different" | "missing" | "partial_missing" };
export type Cmp = { investigations: { id: string; acronym: string; full_name: string }[]; rows: Row[]; summary: string };

const TONE = { same: "ok", different: "accent", missing: "neutral", partial_missing: "warn" } as const;
const ICON = { same: Equal, different: GitCompareArrows, missing: CircleDashed, partial_missing: CircleDashed } as const;

function Value({ v }: { v: Val }) {
  const { t } = useI18n();
  if (v === null) return <span className="text-xs italic text-subtle">{t("cp.notInKb")}</span>;
  if (Array.isArray(v)) return <ul className="list-disc space-y-1 pl-4 marker:text-subtle">{v.map((x) => <li key={x}>{x}</li>)}</ul>;
  return <>{String(v)}</>;
}

export default function CompareTable({ res, onlyDiff }: { res: Cmp; onlyDiff: boolean }) {
  const { t } = useI18n();
  const count = (s: Row["status"][]) => res.rows.filter((r) => s.includes(r.status)).length;
  const same = count(["same"]), diff = count(["different"]), miss = count(["missing", "partial_missing"]);
  const ratio = res.rows.length ? Math.round((same / res.rows.length) * 100) : 0;
  const rows = onlyDiff ? res.rows.filter((r) => r.status !== "same") : res.rows;
  return (
    <div className="space-y-4">
      <Panel title={t("cp.summary")} sub={t("cp.summarySub")}>
        <p className="text-sm leading-relaxed text-fg">{res.summary}</p>
        <div className="mt-4 flex flex-wrap items-center gap-2" aria-label={t("cp.legend")}>
          <Chip tone="ok">{same} · {t("cp.same")}</Chip><Chip tone="accent">{diff} · {t("cp.different")}</Chip><Chip tone="warn">{miss} · {t("cp.missing")}</Chip>
        </div>
        <div className="mt-4">
          <div className="mb-1.5 flex justify-between text-xs text-muted"><span>{t("cp.similarity")}</span><span className="font-mono">{ratio}%</span></div>
          <div className="flex h-2 overflow-hidden rounded-full bg-raised" role="meter" aria-valuenow={ratio} aria-valuemin={0} aria-valuemax={100} aria-label={t("cp.similarity")}>
            <div className="bg-ok transition-all duration-500" style={{ width: `${(same / Math.max(1, res.rows.length)) * 100}%` }} />
            <div className="bg-accent transition-all duration-500" style={{ width: `${(diff / Math.max(1, res.rows.length)) * 100}%` }} />
            <div className="bg-warn/70 transition-all duration-500" style={{ width: `${(miss / Math.max(1, res.rows.length)) * 100}%` }} />
          </div>
        </div>
      </Panel>
      {rows.length === 0 ? <div className="panel p-8 text-center text-sm text-muted">{t("cp.noRows")}</div> : (
        <div className="panel overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <caption className="sr-only">{t("cp.title")}</caption>
            <thead>
              <tr className="border-b border-line bg-raised/50">
                <th scope="col" className="w-40 p-3 text-left"><span className="label">{t("cp.param")}</span></th>
                {res.investigations.map((i) => <th key={i.id} scope="col" className="p-3 text-left align-bottom"><div className="font-semibold text-fg">{i.acronym}</div><div className="text-[11px] font-normal text-subtle">{i.full_name}</div></th>)}
                <th scope="col" className="w-32 p-3 text-left"><span className="label">{t("cp.status")}</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const I = ICON[r.status];
                const key = (r.status === "partial_missing" ? "cp.partial_missing" : `cp.${r.status}`) as Key;
                return (
                  <tr key={r.key} className="border-b border-line/60 align-top last:border-0 hover:bg-raised/30">
                    <th scope="row" className="p-3 text-left font-medium text-muted">{r.label}</th>
                    {r.values.map((v, i) => <td key={i} className="min-w-[200px] p-3 leading-relaxed text-fg"><Value v={v} /></td>)}
                    <td className="p-3"><Chip tone={TONE[r.status]}>{r.status === "same" ? <Check size={11} /> : <I size={11} />}{t(key)}</Chip></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
