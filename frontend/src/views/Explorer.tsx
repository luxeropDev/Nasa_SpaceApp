import { useEffect, useMemo, useState } from "react";
import { FileText, GitCompareArrows, SearchX, X } from "lucide-react";
import { useGet, PageSkeleton, ErrorBox, Empty, Page, SearchInput } from "../components/ui";
import { useToast } from "../components/Toast";
import ResearchCard from "../components/research/ResearchCard";
import { useI18n } from "../i18n";
import { api, MAX_COMPARE } from "../api";
import { go, href } from "../nav";
import type { Inv, Source } from "../api";
import { selection, useSelection } from "../selection";
import Detail from "./ExplorerDetail";
import ExplorerFilters, { NO_FILTER } from "./ExplorerFilters";
import type { F } from "./ExplorerFilters";

const LAYOUT = "flamewise.explorer.layout";

/** Floating selection tray: hand the current selection to Compare or Reports. */
export function SelectionTray() {
  const { t } = useI18n();
  const ids = useSelection();
  if (!ids.length) return null;
  const q = { ids: ids.join(",") };
  return (
    <div className="no-print pointer-events-none fixed inset-x-0 bottom-4 z-[45] flex justify-center px-3 lg:pl-[var(--sb)]">
      <div className="pointer-events-auto flex max-w-full items-center gap-2 rounded-surface border border-line-strong bg-surface/95 p-1.5 pl-4 shadow-pop backdrop-blur-xl" style={{ animation: "fadeUpSm .3s cubic-bezier(0.16,1,0.3,1) both" }} role="region" aria-label={t("sel.title")}>
        <span className="truncate text-[13px] text-fg"><b className="font-semibold">{ids.length}</b><span className="text-subtle">/{MAX_COMPARE}</span> {t("sel.selected")}</span>
        <a className={`btn btn-sm btn-accent ${ids.length < 2 ? "pointer-events-none opacity-45" : ""}`} aria-disabled={ids.length < 2} href={href("compare", null, q)}><GitCompareArrows size={14} /><span className="hidden sm:inline">{t("sel.compare")}</span></a>
        <a className="btn btn-sm" href={href("reports", null, q)}><FileText size={14} /><span className="hidden sm:inline">{t("sel.report")}</span></a>
        <button className="icon-btn !h-8 !w-8" onClick={() => selection.clear()} aria-label={t("sel.clear")} title={t("sel.clear")}><X size={15} /></button>
      </div>
    </div>
  );
}

export default function Explorer({ id, params }: { id: string | null; params: URLSearchParams }) {
  const { t, lang } = useI18n();
  const toast = useToast();
  const inv = useGet<Inv[]>("/investigations");
  const src = useGet<Source[]>("/sources");
  const selected = useSelection();
  const [q, setQ] = useState(params.get("q") ?? "");
  const [f, setF] = useState<F>(NO_FILTER);
  const [sort, setSort] = useState("relevance");
  const [layout, setLayoutState] = useState<"list" | "grid">(() => { try { return localStorage.getItem(LAYOUT) === "grid" ? "grid" : "list"; } catch { return "list"; } });
  const [ranked, setRanked] = useState<{ id: string; score: number }[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchFailed, setSearchFailed] = useState(false);
  const setLayout = (l: "list" | "grid") => { setLayoutState(l); try { localStorage.setItem(LAYOUT, l); } catch { /* optional */ } };

  // select options hold localized strings, so reset them when the language changes
  useEffect(() => { setF(NO_FILTER); }, [lang]);

  // debounced backend (BM25) search — the backend stays the single ranking implementation
  useEffect(() => {
    if (!q.trim()) { setRanked(null); setSearching(false); setSearchFailed(false); return; }
    setSearching(true);
    let on = true;
    const timer = window.setTimeout(() => {
      api.post<{ score: number; investigation: Inv }[]>("/search", { query: q, limit: 30 })
        .then((r) => { if (on) { setRanked(r.map((x) => ({ id: x.investigation.id, score: x.score }))); setSearchFailed(false); } })
        .catch(() => { if (on) { setRanked(null); setSearchFailed(true); toast.push(t("ex.searchError"), "error"); } })
        .finally(() => on && setSearching(false));
    }, 250);
    return () => { on = false; window.clearTimeout(timer); };
  }, [q, t, toast, lang]);

  const scoreOf = useMemo(() => Object.fromEntries((ranked ?? []).map((r) => [r.id, r.score])), [ranked]);
  const list = useMemo(() => {
    if (!inv.data) return [];
    let l = inv.data.filter((i) => (!f.fuel || i.fuel_type === f.fuel) && (!f.domain || i.research_domain === f.domain) && (!f.safety || i.fire_safety_domain === f.safety)
      && (!f.scenario || i.relevance.includes(f.scenario)) && (!f.hardware || i.hardware === f.hardware) && (!f.gravity || i.gravity_environment === f.gravity));
    if (ranked) { l = l.filter((i) => i.id in scoreOf); if (sort === "relevance") l = [...l].sort((a, b) => scoreOf[b.id] - scoreOf[a.id]); }
    if (sort === "mission") l = [...l].sort((a, b) => b.relevance.length - a.relevance.length);
    if (sort === "name") l = [...l].sort((a, b) => a.acronym.localeCompare(b.acronym));
    return l;
  }, [inv.data, f, ranked, scoreOf, sort]);

  const toggle = (iid: string) => { if (!selection.toggle(iid)) toast.push(t("cp.max"), "info"); };

  if (inv.error) return <div className="mx-auto max-w-[1320px] px-4 pt-9 sm:px-6 lg:px-8"><ErrorBox error={inv.error} retry={inv.retry} /></div>;
  if (!inv.data || !src.data) return <div className="mx-auto max-w-[1320px] px-4 pt-9 sm:px-6 lg:px-8"><PageSkeleton /></div>;
  const d = inv.data;
  if (id) {
    const sel = d.find((i) => i.id === id);
    if (!sel) return <div className="mx-auto max-w-[1320px] px-4 pt-9 sm:px-6 lg:px-8"><Empty icon={SearchX} text={t("det.notFound")} action={<a className="btn" href={href("explorer")}>{t("det.back")}</a>} /></div>;
    return <><Detail inv={sel} all={d} srcs={Object.fromEntries(src.data.map((s) => [s.id, s]))} /><SelectionTray /></>;
  }

  const dirty = q !== "" || Object.values(f).some(Boolean);
  const clear = () => { setQ(""); setF(NO_FILTER); };
  return (
    <Page eyebrow={t("ex.eyebrow")} title={t("ex.title")} sub={t("ex.sub")}
      actions={<button className="btn btn-sm" onClick={() => go(href("compare", null, { ids: selected.join(",") }))} disabled={selected.length < 2}><GitCompareArrows size={14} />{t("ex.compareSel", { n: selected.length })}</button>}>
      <div className="panel space-y-4 p-4">
        <SearchInput id="ex-q" value={q} onChange={setQ} placeholder={t("ex.search.ph")} label={t("ex.search.label")} busy={searching} />
        <ExplorerFilters data={d} f={f} setF={setF} sort={sort} setSort={setSort} layout={layout} setLayout={setLayout} />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2" aria-live="polite">
        <p className="text-[12.5px] text-muted">
          {searching ? `${t("ex.searching")}…` : t("ex.count", { n: list.length, total: d.length })}
          {ranked && !searching && <span className="ml-2 font-mono text-[11px] text-subtle">· {t("ex.rankedBy")}</span>}
          {searchFailed && <span className="ml-2 text-danger">{t("ex.searchError")}</span>}
        </p>
        {dirty && <button className="btn btn-ghost btn-sm" onClick={clear}><X size={13} />{t("ex.clear")}</button>}
      </div>
      {list.length === 0 ? <Empty icon={SearchX} title={t("ex.emptyTitle")} text={t("ex.empty")} action={dirty ? <button className="btn" onClick={clear}>{t("ex.clear")}</button> : undefined} /> : layout === "grid" ? (
        <ul className="stagger grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {list.map((i) => <li key={i.id}><ResearchCard inv={i} layout="grid" selected={selected.includes(i.id)} onToggle={() => toggle(i.id)} score={scoreOf[i.id]} /></li>)}
        </ul>
      ) : (
        <ul className="panel stagger divide-y divide-line overflow-hidden">
          {list.map((i) => <li key={i.id}><ResearchCard inv={i} layout="list" selected={selected.includes(i.id)} onToggle={() => toggle(i.id)} score={scoreOf[i.id]} /></li>)}
        </ul>
      )}
      <SelectionTray />
    </Page>
  );
}
