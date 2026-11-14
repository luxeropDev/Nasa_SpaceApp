import { useMemo, useState } from "react";
import { ChevronDown, ExternalLink } from "lucide-react";
import { useGet, ErrorBox, Page, PageSkeleton, SearchInput, Skeleton } from "../components/ui";
import { ConditionsTable, DatasetMeta } from "../components/research/Evidence";
import { useI18n } from "../i18n";
import type { Key } from "../i18n";
import { href } from "../nav";
import type { DatasetCard, DatasetFull } from "../api";

const PARAMS = ["oxygen", "pressure", "flow", "result"] as const;

/** Full PSI record, fetched only when a row is expanded. */
function DatasetDetail({ acc }: { acc: string }) {
  const { t } = useI18n();
  const d = useGet<DatasetFull>(`/datasets/${acc}`);
  if (d.error) return <ErrorBox error={d.error} retry={d.retry} />;
  if (!d.data) return <Skeleton className="h-40" />;
  const x = d.data;
  return (
    <div className="grid gap-5 border-t border-line bg-bg px-4 py-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="min-w-0 space-y-4">
        <DatasetMeta d={x} />
        <div>
          <p className="label mb-1">{t("v4.ds.objective")}</p>
          <p className="text-[12.5px] leading-relaxed text-fg" lang="en">{x.objective}</p>
        </div>
        {x.approach && <details className="text-[12.5px]"><summary className="cursor-pointer text-accent">{t("v4.ds.approach")}</summary><p className="mt-1 leading-relaxed text-muted" lang="en">{x.approach}</p></details>}
        {x.contacts.length > 0 && <p className="text-[12px] text-muted"><span className="text-subtle">{t("v4.ds.contacts")}: </span>{x.contacts.map((c) => `${c.name}${c.role ? ` (${c.role})` : ""}`).join("; ")}</p>}
        <p className="font-mono text-[10.5px] text-subtle">{t("v4.ds.prov", { url: x.provenance.api_url })} · sha256 {x.provenance.raw_sha256.slice(0, 12)}…</p>
      </div>
      <div className="min-w-0 space-y-4">
        <div><p className="label mb-2">{t("v4.det.conditionsPsi")}</p><ConditionsTable conditions={x.conditions} /></div>
        <div>
          <p className="label mb-2">{t("v4.det.pubs")} ({x.publications.length})</p>
          <ol className="max-h-56 space-y-1.5 overflow-y-auto pr-2 text-[12px]">
            {x.publications.map((p, k) => <li key={k} className="leading-snug"><span className="text-fg">{p.title}</span>{p.doi && <> · <a className="font-mono text-accent hover:underline" href={`https://doi.org/${p.doi}`} target="_blank" rel="noreferrer">{p.doi}</a></>}</li>)}
          </ol>
        </div>
      </div>
    </div>
  );
}

export default function Datasets() {
  const { t } = useI18n();
  const d = useGet<DatasetCard[]>("/datasets");
  const [q, setQ] = useState("");
  const [type, setType] = useState("");
  const [param, setParam] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const list = useMemo(() => {
    const ql = q.trim().toLowerCase();
    return (d.data ?? []).filter((x) => (!type || x.project_type === type) && (!param || x.conditions.some((c) => c.parameter === param))
      && (!ql || [x.accession, x.title, x.acronym ?? "", x.doi ?? "", x.hardware ?? "", x.sub_research_area ?? ""].join(" ").toLowerCase().includes(ql)));
  }, [d.data, q, type, param]);
  const types = Array.from(new Set((d.data ?? []).map((x) => x.project_type).filter(Boolean))) as string[];

  return (
    <Page eyebrow={t("v4.ds.eyebrow")} title={t("v4.ds.title")} sub={t("v4.ds.sub")}>
      {d.error ? <ErrorBox error={d.error} retry={d.retry} /> : !d.data ? <PageSkeleton /> : (
        <>
          <div className="flex flex-wrap items-end gap-3 border border-line bg-surface p-4">
            <SearchInput id="ds-q" className="w-full sm:w-72" value={q} onChange={setQ} placeholder={t("v4.ds.search")} label={t("v4.ds.search")} />
            <label className="text-[12px] text-subtle">{t("v4.ds.type")}
              <select className="select mt-1 !w-48" value={type} onChange={(e) => setType(e.target.value)}><option value="">{t("v4.all")}</option>{types.map((x) => <option key={x}>{x}</option>)}</select>
            </label>
            <label className="text-[12px] text-subtle">{t("v4.ds.hasParam")}
              <select className="select mt-1 !w-48" value={param} onChange={(e) => setParam(e.target.value)}><option value="">{t("v4.all")}</option>{PARAMS.map((p) => <option key={p} value={p}>{t(`v4.param.${p}` as Key)}</option>)}</select>
            </label>
            <p className="ml-auto font-mono text-[11.5px] text-subtle" aria-live="polite">{t("ex.count", { n: list.length, total: d.data.length })}</p>
          </div>
          <div className="overflow-x-auto border border-line bg-surface">
            <table className="w-full min-w-[900px] text-left text-[12.5px]">
              <thead className="border-b border-line bg-raised text-[11px] text-subtle">
                <tr>
                  <th scope="col" className="px-3 py-2 font-medium">{t("v4.ds.accession")}</th>
                  <th scope="col" className="px-3 py-2 font-medium">{t("v4.ds.investigation")}</th>
                  <th scope="col" className="px-3 py-2 font-medium">{t("v4.ds.type")}</th>
                  <th scope="col" className="px-3 py-2 font-medium">{t("v4.ds.dates")}</th>
                  <th scope="col" className="px-3 py-2 font-medium">{t("v4.ds.params")}</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">{t("v4.ds.rowsCol")}</th>
                  <th scope="col" className="px-3 py-2 font-medium">{t("v4.ds.kb")}</th>
                  <th scope="col" className="w-8 px-2 py-2"><span className="sr-only">{t("v4.ds.details")}</span></th>
                </tr>
              </thead>
              {list.map((x) => {
                const ps = Array.from(new Set(x.conditions.map((c) => c.parameter))).filter((p) => (PARAMS as readonly string[]).includes(p));
                const isOpen = open === x.accession;
                return (
                  <tbody key={x.accession} className="border-b border-line last:border-0">
                    <tr className="align-top hover:bg-raised">
                      <td className="whitespace-nowrap px-3 py-2.5"><a className="font-mono text-[12px] font-medium text-accent hover:underline" href={x.landing_url} target="_blank" rel="noreferrer">{x.accession}<ExternalLink size={10} className="ml-1 inline" /></a>{x.doi && <span className="block font-mono text-[10.5px] text-subtle">{x.doi}</span>}</td>
                      <td className="max-w-[340px] px-3 py-2.5"><span className="font-semibold text-fg">{x.acronym ?? "—"}</span><span className="block text-[12px] leading-snug text-muted" lang="en">{x.title}</span></td>
                      <td className="px-3 py-2.5 text-muted">{x.project_type ?? t("common.na")}<span className="block text-[11.5px] text-subtle">{x.flight_platform ?? ""}</span></td>
                      <td className="whitespace-nowrap px-3 py-2.5 font-mono text-[11.5px] text-muted">{x.start_date ?? "?"}<span className="block">{x.end_date ?? "?"}</span></td>
                      <td className="px-3 py-2.5">{ps.length ? <span className="flex flex-wrap gap-1">{ps.map((p) => <span key={p} className="chip">{t(`v4.param.${p}` as Key)}</span>)}</span> : <span className="text-subtle">{t("common.na")}</span>}</td>
                      <td className="px-3 py-2.5 text-right font-mono tabular-nums text-fg">{x.experiment_rows || "—"}</td>
                      <td className="px-3 py-2.5">{x.kb_record ? <a className="font-mono text-[12px] text-accent hover:underline" href={href("explorer", x.kb_record)}>{x.kb_record}</a> : <span className="text-[11.5px] text-subtle">{t("v4.ds.notLinked")}</span>}</td>
                      <td className="px-2 py-2.5"><button className="icon-btn !h-7 !w-7" aria-expanded={isOpen} aria-label={t("v4.ds.details")} onClick={() => setOpen(isOpen ? null : x.accession)}><ChevronDown size={15} className={`transition-transform ${isOpen ? "rotate-180" : ""}`} /></button></td>
                    </tr>
                    {isOpen && <tr><td colSpan={8} className="p-0"><DatasetDetail acc={x.accession} /></td></tr>}
                  </tbody>
                );
              })}
            </table>
          </div>
          <p className="text-[11.5px] leading-relaxed text-subtle">{t("v4.ds.note")}</p>
        </>
      )}
    </Page>
  );
}
