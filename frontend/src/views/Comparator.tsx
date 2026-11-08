import { useEffect, useMemo, useState } from "react";
import { Plus, X } from "lucide-react";
import { api } from "../api";
import type { Inv } from "../api";
import { useGet, PageSkeleton, Loading, ErrorBox, Page, Chip } from "../components/ui";
import { useI18n } from "../i18n";
import { go, href } from "../nav";
import CompareTable from "./CompareTable";
import type { Cmp } from "./CompareTable";

const PRESETS = [
  { k: "cp.p1" as const, ids: ["BASS_001", "SAFFIRE_001"] },
  { k: "cp.p2" as const, ids: ["FLEX_001", "CFI_001"] },
  { k: "cp.p3" as const, ids: ["SAME_001", "SPICE_001", "ACME_001"] },
];

export default function Comparator({ params }: { params: URLSearchParams }) {
  const { t, lang } = useI18n();
  const all = useGet<Inv[]>("/investigations");
  const [res, setRes] = useState<Cmp | null>(null);
  const [err, setErr] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [onlyDiff, setOnlyDiff] = useState(false);

  // the URL is the single source of truth for the selection (shareable, survives reload)
  const ids = useMemo(() => (params.get("ids") ?? "BASS_001,SAFFIRE_001").split(",").filter(Boolean).slice(0, 3), [params]);
  const setIds = (n: string[]) => go(href("compare", null, { ids: n.join(",") }));

  useEffect(() => {
    if (ids.length < 2) { setRes(null); setErr(null); return; }
    let on = true;
    setBusy(true); setErr(null);
    api.post<Cmp>("/compare", { ids }).then((r) => on && setRes(r)).catch((e) => { if (on) { setErr(e); setRes(null); } }).finally(() => on && setBusy(false));
    return () => { on = false; };
  }, [ids, lang]);

  if (all.error) return <ErrorBox error={all.error} retry={all.retry} />;
  if (!all.data) return <PageSkeleton />;
  const byId = Object.fromEntries(all.data.map((i) => [i.id, i]));
  const avail = all.data.filter((i) => !ids.includes(i.id));
  return (
    <Page title={t("cp.title")} sub={t("cp.sub")}>
      <div className="panel space-y-4 p-4">
        <div className="flex flex-wrap items-center gap-2">
          {ids.map((id) => (
            <Chip key={id} tone="accent" className="!py-1 !pl-3 !pr-1.5 !text-xs">{byId[id]?.acronym ?? id}
              <button className="rounded-full p-0.5 hover:bg-accent/20" onClick={() => setIds(ids.filter((x) => x !== id))} aria-label={t("cp.remove", { name: byId[id]?.acronym ?? id })}><X size={12} /></button></Chip>
          ))}
          {ids.length < 3 ? (
            <label className="flex w-full min-w-0 items-center gap-1.5 sm:w-auto"><Plus size={14} className="text-subtle" aria-hidden="true" /><span className="sr-only">{t("cp.add")}</span>
              <select className="input min-w-0 max-w-full flex-1 sm:!w-auto sm:flex-none" value="" onChange={(e) => e.target.value && setIds([...ids, e.target.value])}>
                <option value="">{t("cp.addPh")}</option>{avail.map((i) => <option key={i.id} value={i.id}>{i.acronym} — {i.full_name}</option>)}
              </select></label>
          ) : <span className="label !normal-case !tracking-normal">{t("cp.max")}</span>}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2"><span className="label">{t("cp.presets")}</span>
            {PRESETS.map((p) => <a key={p.k} href={href("compare", null, { ids: p.ids.join(",") })} className="chip transition hover:border-accent/50 hover:text-accent">{t(p.k)}</a>)}</div>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-muted"><input type="checkbox" className="h-4 w-4 accent-[rgb(var(--accent))]" checked={onlyDiff} onChange={(e) => setOnlyDiff(e.target.checked)} />{t("cp.onlyDiff")}</label>
        </div>
      </div>
      {ids.length < 2 && <div className="panel p-10 text-center text-sm text-muted">{t("cp.min")}</div>}
      {busy && !res && <Loading text={`${t("cp.loading")}`} />}
      {err != null && <ErrorBox error={err} />}
      {res && ids.length >= 2 && <div className={busy ? "opacity-60 transition-opacity" : "transition-opacity"}><CompareTable res={res} onlyDiff={onlyDiff} /></div>}
    </Page>
  );
}
