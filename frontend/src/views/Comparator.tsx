import { useEffect, useMemo, useState } from "react";
import { Download, FileText, GitCompareArrows, Plus, X } from "lucide-react";
import { api, MAX_COMPARE } from "../api";
import type { Inv } from "../api";
import { useGet, PageSkeleton, Loading, ErrorBox, Page, Empty } from "../components/ui";
import { useToast } from "../components/Toast";
import { useI18n } from "../i18n";
import { go, href } from "../nav";
import CompareTable, { toCSV, toMarkdown } from "./CompareTable";
import type { Cmp } from "./CompareTable";

const PRESETS = [
  { k: "cp.p1" as const, ids: ["BASS_001", "SAFFIRE_001"] },
  { k: "cp.p2" as const, ids: ["FLEX_001", "CFI_001"] },
  { k: "cp.p3" as const, ids: ["SAME_001", "SPICE_001", "ACME_001"] },
  { k: "cp.p4" as const, ids: ["SAFFIRE_001", "SAFFIRE_002", "SAFFIRE_003", "BASS_002"] },
];

function download(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  document.body.appendChild(a); a.click(); a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function Comparator({ params }: { params: URLSearchParams }) {
  const { t, lang } = useI18n();
  const toast = useToast();
  const all = useGet<Inv[]>("/investigations");
  const [res, setRes] = useState<Cmp | null>(null);
  const [err, setErr] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [onlyDiff, setOnlyDiff] = useState(false);
  const [tick, setTick] = useState(0);

  // the URL is the single source of truth for the selection (shareable, survives reload)
  const ids = useMemo(() => Array.from(new Set((params.get("ids") ?? "BASS_001,SAFFIRE_001").split(",").filter(Boolean))).slice(0, MAX_COMPARE), [params]);
  const setIds = (n: string[]) => go(href("compare", null, { ids: n.join(",") }));

  useEffect(() => {
    if (ids.length < 2) { setRes(null); setErr(null); return; }
    let on = true;
    setBusy(true); setErr(null);
    api.post<Cmp>("/compare", { ids }).then((r) => on && setRes(r)).catch((e) => { if (on) { setErr(e); setRes(null); } }).finally(() => on && setBusy(false));
    return () => { on = false; };
  }, [ids, lang, tick]);

  const wrap = (c: React.ReactNode) => <Page eyebrow={t("cp.eyebrow")} title={t("cp.title")} sub={t("cp.sub")}>{c}</Page>;
  if (all.error) return wrap(<ErrorBox error={all.error} retry={all.retry} />);
  if (!all.data) return wrap(<PageSkeleton />);
  const byId = Object.fromEntries(all.data.map((i) => [i.id, i]));
  const avail = all.data.filter((i) => !ids.includes(i.id));
  const stamp = new Date().toISOString().slice(0, 10);
  const exportAs = (kind: "csv" | "md") => {
    if (!res) return;
    if (kind === "csv") download(`flamewise-comparison-${stamp}.csv`, toCSV(res, t), "text/csv;charset=utf-8");
    else download(`flamewise-comparison-${stamp}.md`, toMarkdown(res, t), "text/markdown;charset=utf-8");
    toast.push(t("cp.exported"), "success");
  };

  return (
    <Page eyebrow={t("cp.eyebrow")} title={t("cp.title")} sub={t("cp.sub")}
      actions={res && ids.length >= 2 ? (<>
        <button className="btn btn-sm" onClick={() => exportAs("csv")}><Download size={14} />CSV</button>
        <button className="btn btn-sm" onClick={() => exportAs("md")}><Download size={14} />Markdown</button>
        <a className="btn-cut-sm btn-cut" href={href("reports", null, { ids: ids.join(",") })}><FileText size={14} />{t("cp.toReport")}</a>
      </>) : undefined}>
      <div className="panel space-y-4 p-4">
        <div className="flex flex-wrap items-center gap-2">
          {ids.map((id, n) => (
            <span key={id} className="inline-flex items-center gap-2 rounded-ctl border border-line-strong bg-raised py-1 pl-2.5 pr-1 text-[13px]">
              <span className="font-mono text-[10.5px] text-brand">{String.fromCharCode(65 + n)}</span>
              <span className="font-semibold text-fg">{byId[id]?.acronym ?? id}</span>
              <button className="rounded p-1 text-subtle hover:bg-hover hover:text-fg" onClick={() => setIds(ids.filter((x) => x !== id))} aria-label={t("cp.remove", { name: byId[id]?.acronym ?? id })}><X size={13} /></button>
            </span>
          ))}
          {ids.length < MAX_COMPARE ? (
            <label className="flex w-full min-w-0 items-center gap-1.5 sm:w-auto"><Plus size={14} className="text-subtle" aria-hidden="true" /><span className="sr-only">{t("cp.add")}</span>
              <select className="select min-w-0 max-w-full flex-1 !py-1.5 sm:!w-auto sm:flex-none" value="" onChange={(e) => e.target.value && setIds([...ids, e.target.value])}>
                <option value="">{t("cp.addPh")}</option>{avail.map((i) => <option key={i.id} value={i.id}>{i.acronym} — {i.full_name}</option>)}
              </select></label>
          ) : <span className="text-[12px] text-subtle">{t("cp.max")}</span>}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3">
          <div className="flex flex-wrap items-center gap-1.5"><span className="label mr-1">{t("cp.presets")}</span>
            {PRESETS.map((p) => <a key={p.k} href={href("compare", null, { ids: p.ids.join(",") })} className="chip transition-colors hover:border-line-strong hover:text-fg">{t(p.k)}</a>)}</div>
          <label className="flex cursor-pointer items-center gap-2 text-[13px] text-muted"><input type="checkbox" className="h-4 w-4 accent-[rgb(var(--accent))]" checked={onlyDiff} onChange={(e) => setOnlyDiff(e.target.checked)} />{t("cp.onlyDiff")}</label>
        </div>
      </div>
      {ids.length < 2 && <Empty icon={GitCompareArrows} title={t("cp.minTitle")} text={t("cp.min")} action={<a className="btn" href={href("explorer")}>{t("cp.browse")}</a>} />}
      {busy && !res && <Loading text={t("cp.loading")} />}
      {err != null && <ErrorBox error={err} retry={() => setTick((n) => n + 1)} />}
      {res && ids.length >= 2 && <div className={busy ? "opacity-60 transition-opacity" : "transition-opacity"}><CompareTable res={res} onlyDiff={onlyDiff} /></div>}
    </Page>
  );
}
