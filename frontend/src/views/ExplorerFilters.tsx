import { LayoutGrid, List, X } from "lucide-react";
import { SCENARIOS } from "../api";
import type { Inv } from "../api";
import { useI18n } from "../i18n";
import { Segmented } from "../components/ui";

export type F = { fuel: string; domain: string; safety: string; scenario: string; hardware: string; gravity: string };
export const NO_FILTER: F = { fuel: "", domain: "", safety: "", scenario: "", hardware: "", gravity: "" };
const uniq = (a: string[]) => Array.from(new Set(a)).sort();

function Sel({ id, value, label, opts, onChange }: { id: string; value: string; label: string; opts: { v: string; l: string }[]; onChange: (v: string) => void }) {
  const { t } = useI18n();
  return (
    <div className="min-w-0">
      <label htmlFor={id} className="label mb-1 block !text-[9.5px]">{label}</label>
      <select id={id} className={`select !py-1.5 ${value ? "!border-accent/50 !text-fg" : "text-muted"}`} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">{t("ex.all")}</option>{opts.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
      </select>
    </div>
  );
}

type Props = { data: Inv[]; f: F; setF: (f: F) => void; sort: string; setSort: (s: string) => void; layout: "list" | "grid"; setLayout: (l: "list" | "grid") => void };

/** Filter toolbar. Every option is derived from values present in the data — no unsupported filters. */
export default function ExplorerFilters({ data, f, setF, sort, setSort, layout, setLayout }: Props) {
  const { t, tc } = useI18n();
  const opt = (a: string[]) => uniq(a).map((v) => ({ v, l: v }));
  const defs: { k: keyof F; label: string; opts: { v: string; l: string }[] }[] = [
    { k: "fuel", label: t("ex.f.fuel"), opts: uniq(data.map((i) => i.fuel_type)).map((v) => ({ v, l: tc("fuel", v) })) },
    { k: "domain", label: t("ex.f.domain"), opts: opt(data.map((i) => i.research_domain)) },
    { k: "safety", label: t("ex.f.safety"), opts: uniq(data.map((i) => i.fire_safety_domain)).map((v) => ({ v, l: tc("sd", v) })) },
    { k: "scenario", label: t("ex.f.scenario"), opts: SCENARIOS.filter((s) => data.some((i) => i.relevance.includes(s))).map((v) => ({ v, l: tc("scen", v) })) },
    { k: "hardware", label: t("ex.f.hardware"), opts: opt(data.map((i) => i.hardware)) },
    { k: "gravity", label: t("ex.f.gravity"), opts: opt(data.map((i) => i.gravity_environment)) },
  ];
  const active = defs.filter((d) => f[d.k]);
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-6">
        {defs.map((d) => <Sel key={d.k} id={`f-${d.k}`} label={d.label} value={f[d.k]} opts={d.opts} onChange={(v) => setF({ ...f, [d.k]: v })} />)}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-h-[28px] flex-wrap items-center gap-1.5">
          {active.map((d) => (
            <button key={d.k} type="button" onClick={() => setF({ ...f, [d.k]: "" })} className="chip chip-accent transition-colors hover:bg-accent/20" aria-label={t("ex.removeFilter", { name: `${d.label}: ${d.opts.find((o) => o.v === f[d.k])?.l ?? f[d.k]}` })}>
              <span className="text-accent/70">{d.label}:</span> {d.opts.find((o) => o.v === f[d.k])?.l ?? f[d.k]}<X size={11} aria-hidden="true" />
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="f-sort" className="sr-only">{t("ex.sort")}</label>
          <select id="f-sort" className="select !w-auto !py-1.5 text-[12.5px]" value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="relevance">{t("ex.sort.relevance")}</option><option value="mission">{t("ex.sort.mission")}</option><option value="name">{t("ex.sort.name")}</option>
          </select>
          <Segmented size="sm" label={t("ex.layout")} value={layout} onChange={setLayout} options={[{ value: "list", label: <span className="sr-only">{t("ex.layout.list")}</span>, icon: List }, { value: "grid", label: <span className="sr-only">{t("ex.layout.grid")}</span>, icon: LayoutGrid }]} />
        </div>
      </div>
    </div>
  );
}
