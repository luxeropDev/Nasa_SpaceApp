import { useEffect, useState } from "react";
import { Info } from "lucide-react";
import { api, SAFETY_DOMAINS, SCENARIOS } from "../api";
import { ErrorBox, Page, PageSkeleton } from "../components/ui";
import { useI18n } from "../i18n";
import { go, href } from "../nav";
import IntelResults from "./IntelResults";
import type { Res } from "./IntelResults";

const pick = <T extends string>(v: string | null, all: readonly T[], d: T): T => ((all as readonly string[]).includes(v ?? "") ? (v as T) : d);

function Segment<T extends string>({ label, value, options, render, onChange }: { label: string; value: T; options: readonly T[]; render: (v: T) => string; onChange: (v: T) => void }) {
  return (
    <div role="radiogroup" aria-label={label}>
      <p className="label mb-1.5">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => <button key={o} role="radio" aria-checked={value === o} onClick={() => onChange(o)} className={`btn ${value === o ? "btn-primary" : ""}`}>{render(o)}</button>)}
      </div>
    </div>
  );
}

export default function Intelligence({ params }: { params: URLSearchParams }) {
  const { t, tc, lang } = useI18n();
  // scenario/domain live in the URL so analyses are linkable (the overview matrix links here)
  const scenario = pick(params.get("scenario"), SCENARIOS, "iss");
  const domain = pick(params.get("domain"), SAFETY_DOMAINS, "smoke_detection");
  const [res, setRes] = useState<Res | null>(null);
  const [err, setErr] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let on = true;
    setBusy(true); setErr(null);
    api.post<Res>("/risk-analysis", { scenario, domain }).then((r) => on && setRes(r)).catch((e) => on && setErr(e)).finally(() => on && setBusy(false));
    return () => { on = false; };
  }, [scenario, domain, lang, tick]);

  const set = (s: string, d: string) => go(href("intel", null, { scenario: s, domain: d }));
  return (
    <Page title={t("in.title")} sub={t("in.sub")}>
      <div className="panel flex flex-wrap gap-x-8 gap-y-4 p-4">
        <Segment label={t("in.scenario")} value={scenario} options={SCENARIOS} render={(v) => tc("scen", v)} onChange={(v) => set(v, domain)} />
        <Segment label={t("in.domain")} value={domain} options={SAFETY_DOMAINS} render={(v) => tc("sd", v)} onChange={(v) => set(scenario, v)} />
      </div>
      <div className="panel flex gap-3 border-warn/30 bg-warn/5 p-3.5 text-xs leading-relaxed text-muted" role="note">
        <Info size={16} className="mt-0.5 shrink-0 text-warn" aria-hidden="true" />
        <p><b className="font-semibold text-warn">{t("in.badge")}.</b> {res?.methodology.disclaimer}</p>
      </div>
      {err != null && <ErrorBox error={err} retry={() => setTick((n) => n + 1)} />}
      {busy && !res && <PageSkeleton label={t("in.loading")} />}
      {res && !err && <div className={busy ? "opacity-60 transition-opacity" : "transition-opacity"}><IntelResults res={res} /></div>}
    </Page>
  );
}
