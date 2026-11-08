import { useEffect, useMemo, useState } from "react";
import { useGet, PageSkeleton, ErrorBox, Empty, Page, Chip } from "../components/ui";
import { useToast } from "../components/Toast";
import { useI18n } from "../i18n";
import { api, SCENARIOS } from "../api";
import { href } from "../nav";
import type { Inv, Source } from "../api";
import Detail from "./ExplorerDetail";
import ExplorerFilters, { NO_FILTER } from "./ExplorerFilters";
import type { F } from "./ExplorerFilters";

export default function Explorer({ id }: { id: string | null }) {
  const { t, tc, lang } = useI18n();
  const toast = useToast();
  const inv = useGet<Inv[]>("/investigations");
  const src = useGet<Source[]>("/sources");
  const [q, setQ] = useState("");
  const [f, setF] = useState<F>(NO_FILTER);
  const [sort, setSort] = useState("relevance");
  const [ranked, setRanked] = useState<string[] | null>(null);
  const [searching, setSearching] = useState(false);

  // select options hold localized strings, so reset them when the language changes
  useEffect(() => { setF(NO_FILTER); }, [lang]);

  // debounced backend (BM25) search
  useEffect(() => {
    if (!q.trim()) { setRanked(null); setSearching(false); return; }
    setSearching(true);
    let on = true;
    const timer = window.setTimeout(() => {
      api.post<{ investigation: Inv }[]>("/search", { query: q, limit: 30 })
        .then((r) => on && setRanked(r.map((x) => x.investigation.id)))
        .catch(() => { if (on) { setRanked(null); toast.push(t("ex.searchError"), "error"); } })
        .finally(() => on && setSearching(false));
    }, 250);
    return () => { on = false; window.clearTimeout(timer); };
  }, [q, t, toast]);

  const list = useMemo(() => {
    if (!inv.data) return [];
    let l = inv.data.filter((i) => (!f.fuel || i.fuel_type === f.fuel) && (!f.domain || i.research_domain === f.domain) && (!f.hardware || i.hardware === f.hardware) && (!f.gravity || i.gravity_environment === f.gravity));
    if (ranked) { l = l.filter((i) => ranked.includes(i.id)); if (sort === "relevance") l = [...l].sort((a, b) => ranked.indexOf(a.id) - ranked.indexOf(b.id)); }
    if (sort === "mission") l = [...l].sort((a, b) => b.relevance.length - a.relevance.length);
    if (sort === "name") l = [...l].sort((a, b) => a.acronym.localeCompare(b.acronym));
    return l;
  }, [inv.data, f, ranked, sort]);

  if (inv.error) return <ErrorBox error={inv.error} retry={inv.retry} />;
  if (!inv.data || !src.data) return <PageSkeleton />;
  const d = inv.data;
  if (id) {
    const sel = d.find((i) => i.id === id);
    if (!sel) return <Empty text={t("det.notFound")} action={<a className="btn" href={href("explorer")}>{t("det.back")}</a>} />;
    return <Detail inv={sel} all={d} srcs={Object.fromEntries(src.data.map((s) => [s.id, s]))} />;
  }

  const dirty = q !== "" || Object.values(f).some(Boolean);
  const clear = () => { setQ(""); setF(NO_FILTER); };
  return (
    <Page title={t("ex.title")} sub={t("ex.sub")}>
      <ExplorerFilters data={d} q={q} setQ={setQ} f={f} setF={setF} sort={sort} setSort={setSort} />
      <div className="flex items-center justify-between" aria-live="polite">
        <p className="label !normal-case !tracking-normal">{searching ? `${t("ex.searching")}…` : t("ex.count", { n: list.length, total: d.length })}</p>
        {dirty && <button className="btn btn-ghost !py-1 text-xs" onClick={clear}>{t("ex.clear")}</button>}
      </div>
      {list.length === 0 ? <Empty text={t("ex.empty")} action={dirty ? <button className="btn" onClick={clear}>{t("ex.clear")}</button> : undefined} /> : (
        <ul className="stagger grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {list.map((i) => (
            <li key={i.id}>
              <a href={href("explorer", i.id)} className="panel panel-hover flex h-full flex-col p-5">
                <div className="flex items-start justify-between gap-2"><span className="text-base font-semibold text-fg">{i.acronym}</span><Chip>{tc("fuel", i.fuel_type)}</Chip></div>
                <span className="mt-0.5 text-xs text-subtle">{i.full_name}</span>
                <p className="mt-3 line-clamp-3 flex-1 text-sm leading-relaxed text-muted">{i.objective}</p>
                <div className="mt-4 flex flex-wrap gap-1.5"><Chip tone="accent">{i.research_domain}</Chip></div>
                <div className="mt-3 flex items-center gap-1" aria-hidden="true">
                  {SCENARIOS.map((s) => <span key={s} className={`h-1.5 flex-1 rounded-full ${i.relevance.includes(s) ? "bg-accent" : "bg-raised"}`} />)}
                </div>
                <span className="label mt-1.5 !normal-case !tracking-normal">{t("ex.scenarios", { n: i.relevance.length })}</span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </Page>
  );
}
