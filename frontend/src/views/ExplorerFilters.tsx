import { useState } from "react";
import { SlidersHorizontal, X } from "lucide-react";
import { SCENARIOS } from "../api";
import type { Inv } from "../api";
import { useI18n } from "../i18n";

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

type Props = { data: Inv[]; f: F; setF: (f: F) => void; onClear: () => void };

/** Filter toolbar. Every option is derived from values present in the data — no unsupported filters. */
export default function ExplorerFilters({ data, f, setF, onClear }: Props) {
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
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button type="button" className="btn w-full justify-between lg:hidden" aria-expanded={open} aria-controls="ex-filters" onClick={() => setOpen((o) => !o)}>
        <SlidersHorizontal size={13} />{t("ex2.filters")}{active.length > 0 && <span className="font-mono text-accent">{active.length}</span>}
      </button>
      <div id="ex-filters" className={`${open ? "block" : "hidden"} mt-3 border border-line bg-surface p-4 lg:mt-0 lg:block lg:border-0 lg:bg-transparent lg:p-0`}>
        <div className="mb-5 hidden items-center justify-between border-b border-line pb-3 lg:flex">
          <h2 className="font-display text-[18px] font-bold text-fg">{t("ex2.filters")}</h2>
          {active.length > 0 && <button className="text-xs font-semibold text-accent hover:underline" onClick={onClear}>{t("common.reset")}</button>}
        </div>
        <div className="space-y-4">
        {defs.map((d) => <Sel key={d.k} id={`f-${d.k}`} label={d.label} value={f[d.k]} opts={d.opts} onChange={(v) => setF({ ...f, [d.k]: v })} />)}
        </div>
        <div className="mt-5 flex flex-wrap gap-1.5 border-t border-line pt-4">
          {active.map((d) => (
            <button key={d.k} type="button" onClick={() => setF({ ...f, [d.k]: "" })} className="chip chip-accent transition-colors hover:bg-accent/20" aria-label={t("ex.removeFilter", { name: `${d.label}: ${d.opts.find((o) => o.v === f[d.k])?.l ?? f[d.k]}` })}>
              <span className="text-accent/70">{d.label}:</span> {d.opts.find((o) => o.v === f[d.k])?.l ?? f[d.k]}<X size={11} aria-hidden="true" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
