import { Search, X } from "lucide-react";
import { useI18n } from "../i18n";
import type { Inv } from "../api";

export type F = { fuel: string; domain: string; hardware: string; gravity: string };
export const NO_FILTER: F = { fuel: "", domain: "", hardware: "", gravity: "" };
const uniq = (a: string[]) => Array.from(new Set(a)).sort();

function Sel({ id, value, label, opts, onChange }: { id: string; value: string; label: string; opts: { v: string; l: string }[]; onChange: (v: string) => void }) {
  const { t } = useI18n();
  return (
    <div className="min-w-[9.5rem] flex-1 sm:flex-none">
      <label htmlFor={id} className="label mb-1 block">{label}</label>
      <select id={id} className="input" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">{t("ex.all")}</option>{opts.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
      </select>
    </div>
  );
}

type Props = { data: Inv[]; q: string; setQ: (v: string) => void; f: F; setF: (f: F) => void; sort: string; setSort: (s: string) => void };

export default function ExplorerFilters({ data, q, setQ, f, setF, sort, setSort }: Props) {
  const { t, tc } = useI18n();
  const opt = (a: string[]) => uniq(a).map((v) => ({ v, l: v }));
  return (
    <div className="panel space-y-3 p-4">
      <div className="relative">
        <label htmlFor="ex-q" className="sr-only">{t("ex.search.label")}</label>
        <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-subtle" aria-hidden="true" />
        <input id="ex-q" type="search" className="input !pl-9 !pr-9" placeholder={t("ex.search.ph")} value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" />
        {q && <button className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-subtle hover:text-fg" onClick={() => setQ("")} aria-label={t("common.reset")}><X size={14} /></button>}
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <Sel id="f-fuel" label={t("ex.f.fuel")} value={f.fuel} opts={uniq(data.map((i) => i.fuel_type)).map((v) => ({ v, l: tc("fuel", v) }))} onChange={(v) => setF({ ...f, fuel: v })} />
        <Sel id="f-dom" label={t("ex.f.domain")} value={f.domain} opts={opt(data.map((i) => i.research_domain))} onChange={(v) => setF({ ...f, domain: v })} />
        <Sel id="f-hw" label={t("ex.f.hardware")} value={f.hardware} opts={opt(data.map((i) => i.hardware))} onChange={(v) => setF({ ...f, hardware: v })} />
        <Sel id="f-gr" label={t("ex.f.gravity")} value={f.gravity} opts={opt(data.map((i) => i.gravity_environment))} onChange={(v) => setF({ ...f, gravity: v })} />
        <div className="min-w-[9.5rem] flex-1 sm:flex-none">
          <label htmlFor="f-sort" className="label mb-1 block">{t("ex.sort")}</label>
          <select id="f-sort" className="input" value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="relevance">{t("ex.sort.relevance")}</option><option value="mission">{t("ex.sort.mission")}</option><option value="name">{t("ex.sort.name")}</option>
          </select>
        </div>
      </div>
    </div>
  );
}
