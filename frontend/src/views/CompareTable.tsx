import { Ban, Check, CircleDashed, Database, Equal, GitCompareArrows, Ruler } from "lucide-react";
import { Chip, Panel } from "../components/ui";
import { useI18n } from "../i18n";
import type { Key } from "../i18n";
import { href } from "../nav";

export type Val = string | number | string[] | null;
export type Row = { key: string; label: string; values: Val[]; status: "same" | "different" | "missing" | "partial_missing" | "not_comparable" | "same_basis" | "reference" };
export type Cmp = { investigations: { id: string; acronym: string; full_name: string }[]; rows: Row[]; summary: string };
type T = (k: Key, p?: Record<string, string | number>) => string;

const TONE = { same: "ok", different: "accent", missing: "neutral", partial_missing: "warn", not_comparable: "warn", same_basis: "ok", reference: "neutral" } as const;
const ICON = { same: Equal, different: GitCompareArrows, missing: CircleDashed, partial_missing: CircleDashed, not_comparable: Ban, same_basis: Ruler, reference: Database } as const;
const statusKey = (s: Row["status"]) => (["not_comparable", "same_basis", "reference"].includes(s) ? `v4.cp.${s}` : s === "partial_missing" ? "cp.partial_missing" : `cp.${s}`) as Key;
const flat = (v: Val, na: string) => (v === null ? na : Array.isArray(v) ? v.join("; ") : String(v));

/** CSV export (RFC 4180 quoting). Missing values are written explicitly, never left blank. */
export function toCSV(res: Cmp, t: T): string {
  const q = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const head = [t("cp.param"), ...res.investigations.map((i) => `${i.acronym} (${i.id})`), t("cp.status")];
  const rows = res.rows.map((r) => [r.label, ...r.values.map((v) => flat(v, t("cp.notInKb"))), t(statusKey(r.status))]);
  return "﻿" + [head, ...rows].map((r) => r.map(q).join(",")).join("\r\n");
}

export function toMarkdown(res: Cmp, t: T): string {
  const esc = (s: string) => s.replace(/\|/g, "\\|").replace(/\n/g, " ");
  const head = `| ${t("cp.param")} | ${res.investigations.map((i) => `${i.acronym} (${i.id})`).join(" | ")} | ${t("cp.status")} |`;
  const sep = `|${" --- |".repeat(res.investigations.length + 2)}`;
  const rows = res.rows.map((r) => `| ${esc(r.label)} | ${r.values.map((v) => esc(flat(v, `_${t("cp.notInKb")}_`))).join(" | ")} | ${t(statusKey(r.status))} |`);
  return `# PyroLens — ${t("cp.title")}\n\n${res.summary}\n\n${[head, sep, ...rows].join("\n")}\n\n_${t("cp.exportNote")}_\n`;
}

function Value({ v }: { v: Val }) {
  const { t } = useI18n();
  if (v === null) return <span className="text-[12px] italic text-subtle">{t("cp.notInKb")}</span>;
  if (Array.isArray(v)) return <ul className="list-disc space-y-1 pl-4 marker:text-subtle">{v.map((x) => <li key={x}>{x}</li>)}</ul>;
  return <>{String(v)}</>;
}

export default function CompareTable({ res, onlyDiff }: { res: Cmp; onlyDiff: boolean }) {
  const { t } = useI18n();
  const count = (s: Row["status"][]) => res.rows.filter((r) => s.includes(r.status)).length;
  const same = count(["same"]), diff = count(["different"]), miss = count(["missing", "partial_missing"]);
  const ratio = res.rows.length ? Math.round((same / res.rows.length) * 100) : 0;
  const rows = onlyDiff ? res.rows.filter((r) => r.status !== "same" && r.status !== "reference") : res.rows;
  const pct = (n: number) => `${(n / Math.max(1, res.rows.length)) * 100}%`;
  return (
    <div className="space-y-4">
      <Panel title={t("cp.summary")} sub={t("cp.summarySub")}>
        <p className="text-[14px] leading-relaxed text-fg">{res.summary}</p>
        <div className="mt-5 grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
          <div>
            <div className="mb-1.5 flex justify-between text-[12px] text-muted"><span>{t("cp.similarity")}</span><span className="font-mono">{ratio}%</span></div>
            <div className="flex h-1.5 overflow-hidden bg-raised" role="meter" aria-valuenow={ratio} aria-valuemin={0} aria-valuemax={100} aria-label={t("cp.similarity")}>
              <div className="bg-ok transition-all duration-500" style={{ width: pct(same) }} />
              <div className="bg-accent transition-all duration-500" style={{ width: pct(diff) }} />
              <div className="bg-warn/70 transition-all duration-500" style={{ width: pct(miss) }} />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1.5" aria-label={t("cp.legend")}>
            <Chip tone="ok">{same} · {t("cp.same")}</Chip><Chip tone="accent">{diff} · {t("cp.different")}</Chip><Chip tone="warn">{miss} · {t("cp.missing")}</Chip>
          </div>
        </div>
        <p className="mt-4 text-[11.5px] leading-relaxed text-subtle">{t("cp.unitsNote")} {t("v4.cp.psiNote")}</p>
      </Panel>
      {rows.length === 0 ? <div className="panel p-8 text-center text-[13px] text-muted">{t("cp.noRows")}</div> : (
        <div className="panel overflow-x-auto">
          <table className="w-full text-[13px]" style={{ minWidth: 220 + res.investigations.length * 220 }}>
            <caption className="sr-only">{t("cp.title")}</caption>
            <thead>
              <tr className="border-b border-line">
                <th scope="col" className="sticky left-0 z-10 w-44 bg-surface p-3 text-left"><span className="label">{t("cp.param")}</span></th>
                {res.investigations.map((i, n) => (
                  <th key={i.id} scope="col" className="p-3 text-left align-bottom">
                    <span className="font-mono text-[10.5px] font-normal text-accent">{String.fromCharCode(65 + n)} · {i.id}</span>
                    <a href={href("explorer", i.id)} className="block text-[14px] font-semibold text-fg hover:text-accent">{i.acronym}</a>
                    <span className="block text-[11.5px] font-normal text-subtle">{i.full_name}</span>
                  </th>
                ))}
                <th scope="col" className="w-32 p-3 text-left"><span className="label">{t("cp.status")}</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const I = ICON[r.status];
                return (
                  <tr key={r.key} className={`border-b border-line align-top last:border-0 ${r.status === "different" ? "bg-accent/[.03]" : ""}`}>
                    <th scope="row" className="sticky left-0 z-10 bg-surface p-3 text-left text-[12.5px] font-medium text-muted">{r.label}</th>
                    {r.values.map((v, i) => <td key={i} className={`min-w-[200px] p-3 leading-relaxed text-fg ${r.key.startsWith("psi_") ? "font-mono text-[11.5px]" : ""}`}><Value v={v} /></td>)}
                    <td className="p-3"><Chip tone={TONE[r.status]}>{r.status === "same" ? <Check size={11} /> : <I size={11} />}{t(statusKey(r.status))}</Chip></td>
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
