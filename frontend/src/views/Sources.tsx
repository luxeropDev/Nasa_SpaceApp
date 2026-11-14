import { useState } from "react";
import { Check, ChevronLeft, ChevronRight, ExternalLink, FileText, Info, Minus } from "lucide-react";
import { useGet, PageSkeleton, ErrorBox, Page, Skeleton } from "../components/ui";
import { LinkKindBadge } from "../components/research/SourceLink";
import { EvidenceClassTag, StatusBadge, VerificationBadge } from "../components/research/Evidence";
import { useI18n } from "../i18n";
import type { Key } from "../i18n";
import { href } from "../nav";
import { STAGES } from "../api";
import type { ContextRec, DocMeta, EvidenceClass, Inv, ResourceStatus, Resources, Source } from "../api";

const CLASS_ORDER: EvidenceClass[] = ["experimental_evidence", "scientific_publication", "background", "historical_incident", "technology_transfer"];

/** The ten official challenge resources and the integration stages each one actually passes (computed by the API). */
function Coverage() {
  const { t } = useI18n();
  const r = useGet<Resources>("/resources");
  if (r.error) return <ErrorBox error={r.error} retry={r.retry} />;
  if (!r.data) return <Skeleton className="h-80" />;
  const { summary, resources } = r.data;
  return (
    <section aria-labelledby="so-cov" className="space-y-3">
      <div className="rule-head flex-wrap">
        <h2 id="so-cov" className="text-[17px] font-semibold text-fg">{t("v4.so.cov")}</h2>
        <span className="font-mono text-[11px] text-subtle">{t("v4.so.covMeta", { d: summary.verified_on })}</span>
        <a className="ml-auto inline-flex items-center gap-1 text-[12px] text-accent hover:underline" href={summary.challenge_url} target="_blank" rel="noreferrer">{t("v4.so.challenge")}<ExternalLink size={11} /></a>
      </div>
      <p className="max-w-4xl text-[12.5px] leading-relaxed text-muted">{t("v4.so.covSub")}</p>
      <p className="flex flex-wrap gap-2">{Object.entries(summary.by_status).map(([k, n]) => <span key={k} className="inline-flex items-center gap-1.5"><StatusBadge s={k as ResourceStatus} /><span className="font-mono text-[12px] text-fg">{n}</span></span>)}</p>
      <div className="overflow-x-auto border border-line bg-surface">
        <table className="w-full min-w-[980px] text-left text-[12.5px]">
          <caption className="sr-only">{t("v4.so.cov")}</caption>
          <thead className="border-b border-line bg-raised text-[11px] text-subtle">
            <tr>
              <th scope="col" className="px-3 py-2 font-medium">#</th>
              <th scope="col" className="px-3 py-2 font-medium">{t("v4.so.resource")}</th>
              {STAGES.map((s) => <th key={s} scope="col" className="px-1.5 py-2 text-center font-medium"><span className="block w-16 leading-tight">{t(`v4.stage.${s}` as Key)}</span></th>)}
              <th scope="col" className="px-3 py-2 font-medium">{t("v4.so.status")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {resources.map((x) => (
              <tr key={x.number} className="align-top">
                <td className="px-3 py-2.5 font-mono text-[11.5px] text-subtle">{String(x.number).padStart(2, "0")}</td>
                <td className="max-w-[300px] px-3 py-2.5">
                  <a className="font-medium text-fg hover:text-accent hover:underline" href={x.url} target="_blank" rel="noreferrer">{x.title}</a>
                  <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11.5px] text-subtle">{x.publisher}<EvidenceClassTag c={x.evidence_class} /></span>
                  {x.exclusion && <span className="mt-1 block text-[11.5px] leading-snug text-warn">{x.exclusion}</span>}
                </td>
                {STAGES.map((s) => (
                  <td key={s} className="px-1.5 py-2.5 text-center">
                    {x.stages[s] ? <Check size={14} className="mx-auto text-ok" aria-label={t("v4.yes")} /> : <Minus size={14} className="mx-auto text-subtle" aria-label={t("v4.no")} />}
                  </td>
                ))}
                <td className="px-3 py-2.5"><StatusBadge s={x.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[11.5px] leading-relaxed text-subtle">{t("v4.so.covRule")}</p>
    </section>
  );
}

/** Page-by-page reader for an extracted document (loaded only when opened). */
function DocViewer({ doc, start = 1 }: { doc: DocMeta; start?: number }) {
  const { t } = useI18n();
  const paged = !!doc.page_count;
  const [page, setPage] = useState(start);
  const d = useGet<DocMeta & { pages: { page: number | null; text: string }[] }>(paged ? `/documents/${doc.id}?page=${page}` : `/documents/${doc.id}`);
  const text = d.data?.pages[0]?.text ?? "";
  return (
    <div className="mt-3 border border-line bg-bg">
      {paged && (
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2">
          <button className="icon-btn !h-8 !w-8" disabled={page <= 1} onClick={() => setPage(page - 1)} aria-label={t("v4.doc.prev")}><ChevronLeft size={15} /></button>
          <label className="flex items-center gap-1.5 text-[12px] text-muted">{t("v4.doc.pageLabel")}
            <select className="select !w-auto !py-1" value={page} onChange={(e) => setPage(Number(e.target.value))}>
              {Array.from({ length: doc.page_count! }, (_, i) => i + 1).map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
            <span className="font-mono">/ {doc.page_count}</span>
          </label>
          <button className="icon-btn !h-8 !w-8" disabled={page >= doc.page_count!} onClick={() => setPage(page + 1)} aria-label={t("v4.doc.next")}><ChevronRight size={15} /></button>
          {doc.sections.length > 0 && (
            <select className="select ml-auto !w-auto max-w-[280px] !py-1" aria-label={t("v4.doc.jump")} value="" onChange={(e) => e.target.value && setPage(Number(e.target.value))}>
              <option value="">{t("v4.doc.jump")}</option>
              {doc.sections.map((s, k) => <option key={k} value={s.page}>{s.title} — {s.page}</option>)}
            </select>
          )}
        </div>
      )}
      <div className="max-h-[420px] overflow-y-auto px-4 py-3">
        {d.error ? <ErrorBox error={d.error} retry={d.retry} /> : !d.data ? <Skeleton className="h-40" /> : text.trim() ? (
          <pre className="whitespace-pre-wrap font-sans text-[12.5px] leading-relaxed text-fg">{text}</pre>
        ) : <p className="text-[12.5px] text-warn">{t("v4.doc.emptyPage")}</p>}
      </div>
      <p className="border-t border-line px-3 py-2 text-[11px] text-subtle">{t("v4.doc.verbatim")}</p>
    </div>
  );
}

function Documents() {
  const { t } = useI18n();
  const d = useGet<DocMeta[]>("/documents");
  const [open, setOpen] = useState<string | null>(null);
  if (d.error) return <ErrorBox error={d.error} retry={d.retry} />;
  if (!d.data) return <Skeleton className="h-60" />;
  return (
    <section aria-labelledby="so-docs" className="space-y-3">
      <div className="rule-head"><h2 id="so-docs" className="text-[17px] font-semibold text-fg">{t("v4.so.docs")}</h2><span className="font-mono text-[11px] text-subtle">{t("v4.so.docsMeta", { n: d.data.length })}</span></div>
      <p className="max-w-4xl text-[12.5px] leading-relaxed text-muted">{t("v4.so.docsSub")}</p>
      <ul className="divide-y divide-line border border-line bg-surface">
        {d.data.map((x) => (
          <li key={x.id} className="p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2 font-mono text-[10.5px] text-subtle"><span>{x.id}</span>{x.challenge_resource && <span>· {t("v4.so.resN", { n: x.challenge_resource })}</span>}<EvidenceClassTag c={x.evidence_class} /></p>
                <h3 className="mt-1 text-[14px] font-semibold text-fg">{x.title}</h3>
                <p className="text-[12px] text-muted">{x.publisher}{x.authors.length > 0 && ` · ${x.authors.join(", ")}`}{x.date && <span className="font-mono"> · {x.date}</span>}{x.report_number && <span className="font-mono"> · {x.report_number}</span>}</p>
                <dl className="mt-2 grid gap-x-4 gap-y-0.5 text-[11.5px] sm:grid-cols-[130px_1fr]">
                  <dt className="text-subtle">{t("v4.doc.extraction")}</dt><dd className="text-fg">{x.extraction.status} · {x.extraction.method}{x.extraction.ocr ? " · OCR" : ` · ${t("v4.doc.noOcr")}`}</dd>
                  {x.extraction.empty_pages && x.extraction.empty_pages.length > 0 && <><dt className="text-subtle">{t("v4.doc.emptyPages")}</dt><dd className="font-mono text-warn">{x.extraction.empty_pages.join(", ")}</dd></>}
                  <dt className="text-subtle">{t("v4.doc.size")}</dt><dd className="font-mono text-fg">{x.page_count ? t("v4.doc.pages", { n: x.page_count }) + " · " : ""}{x.chars.toLocaleString()} {t("v4.doc.chars")} · {x.passages} {t("v4.doc.passages")}</dd>
                  <dt className="text-subtle">{t("v4.doc.retrieved")}</dt><dd className="font-mono text-fg">{x.retrieved_at}</dd>
                  <dt className="text-subtle">SHA-256</dt><dd className="truncate font-mono text-subtle" title={x.sha256}>{x.sha256.slice(0, 24)}…</dd>
                </dl>
              </div>
              <div className="flex shrink-0 flex-wrap gap-1.5">
                <a className="btn btn-sm" href={x.url} target="_blank" rel="noreferrer"><ExternalLink size={13} />{t("v4.doc.original")}</a>
                <button className="btn btn-sm" aria-expanded={open === x.id} onClick={() => setOpen(open === x.id ? null : x.id)}><FileText size={13} />{open === x.id ? t("v4.doc.close") : t("v4.doc.read")}</button>
              </div>
            </div>
            {open === x.id && <DocViewer doc={x} />}
          </li>
        ))}
      </ul>
    </section>
  );
}

function Context() {
  const { t } = useI18n();
  const c = useGet<ContextRec[]>("/context");
  if (c.error) return <ErrorBox error={c.error} retry={c.retry} />;
  if (!c.data) return <Skeleton className="h-60" />;
  return (
    <section aria-labelledby="so-ctx" className="space-y-3">
      <div className="rule-head"><h2 id="so-ctx" className="text-[17px] font-semibold text-fg">{t("v4.so.ctx")}</h2></div>
      <p className="flex max-w-4xl gap-2 rounded-ctl border border-warn/30 bg-warn/[.06] p-3 text-[12.5px] leading-relaxed text-muted"><Info size={15} className="mt-0.5 shrink-0 text-warn" aria-hidden="true" />{t("v4.ctx.notEvidence")}</p>
      <div className="grid gap-3 lg:grid-cols-2">
        {c.data.map((x) => (
          <article key={x.id} className="border border-line bg-surface p-4">
            <p className="flex flex-wrap items-center gap-2"><EvidenceClassTag c={x.kind} /><span className="font-mono text-[11px] text-subtle">{x.year}</span></p>
            <h3 className="mt-1.5 text-[14.5px] font-semibold text-fg">{x.title}</h3>
            <ul className="mt-2 space-y-2.5">
              {x.facts.map((f, k) => (
                <li key={k} className="text-[12.5px] leading-relaxed text-muted">{f.text}
                  <span className="mt-1 block border-l-2 border-line-strong pl-2 text-[11.5px] italic text-subtle" lang="en">“{f.excerpt}”</span>
                </li>
              ))}
            </ul>
            <p className="mt-3 border-t border-line pt-2 text-[12px] leading-relaxed text-fg"><span className="font-medium">{t("v4.ctx.relevance")}: </span>{x.relevance}</p>
            {x.related_investigations.length > 0 && <p className="mt-1.5 flex flex-wrap gap-1.5 text-[11.5px]"><span className="text-subtle">{t("v4.ctx.related")}</span>{x.related_investigations.map((r) => <a key={r} className="font-mono text-accent hover:underline" href={href("explorer", r)}>{r}</a>)}</p>}
            <a className="mt-2 inline-flex items-center gap-1 text-[12px] text-accent hover:underline" href={x.source.url} target="_blank" rel="noreferrer">{x.source.publisher} — {x.source.title}<ExternalLink size={11} /></a>
          </article>
        ))}
      </div>
    </section>
  );
}

function Library({ data, usedBy }: { data: Source[]; usedBy: Record<string, string[]> }) {
  const { t } = useI18n();
  return (
    <section aria-labelledby="so-lib" className="space-y-4">
      <div className="rule-head"><h2 id="so-lib" className="text-[17px] font-semibold text-fg">{t("v4.so.lib")}</h2><span className="font-mono text-[11px] text-subtle">{t("v4.so.libMeta", { n: data.length })}</span></div>
      {CLASS_ORDER.map((cls) => {
        const items = data.filter((s) => s.evidence_class === cls);
        if (!items.length) return null;
        return (
          <div key={cls}>
            <h3 className="mb-2 flex items-center gap-2 text-[13px] font-semibold text-fg"><EvidenceClassTag c={cls} /><span className="font-mono text-[11px] font-normal text-subtle">{items.length}</span></h3>
            <ul className="divide-y divide-line border border-line bg-surface">
              {items.map((x) => (
                <li key={x.id} className="grid gap-x-6 gap-y-2 p-4 md:grid-cols-[1fr_auto]">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 font-mono text-[10.5px] text-subtle"><span>{x.id}</span><span aria-hidden="true">·</span><span>{x.publisher}</span><span aria-hidden="true">·</span><span>{x.type}</span>{x.date && <><span aria-hidden="true">·</span><span>{x.date}</span></>}</p>
                    <h4 className="mt-1 text-[14px] font-semibold leading-snug text-fg">{x.title}</h4>
                    {x.authors.length > 0 && <p className="text-[12px] text-muted">{x.authors.join(", ")}</p>}
                    <p className="mt-1 text-[12.5px] leading-relaxed text-muted">{x.note}</p>
                    <a href={x.url} target="_blank" rel="noreferrer" className="mt-1.5 block break-all font-mono text-[11px] text-accent hover:underline">{x.url}</a>
                    {(usedBy[x.id] ?? []).length > 0 && <p className="mt-1.5 flex flex-wrap gap-1.5 text-[11.5px]"><span className="text-subtle">{t("v4.so.usedBy")}</span>{usedBy[x.id].map((r) => <a key={r} className="font-mono text-accent hover:underline" href={href("explorer", r)}>{r}</a>)}</p>}
                  </div>
                  <div className="flex flex-wrap items-start gap-1.5 md:flex-col md:items-end">
                    <LinkKindBadge kind={x.link_kind} />
                    <VerificationBadge v={x.verification} />
                    {x.accessed && <span className="font-mono text-[10.5px] text-subtle">{t("v4.so.accessed", { d: x.accessed })}</span>}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </section>
  );
}

export default function Sources() {
  const { t } = useI18n();
  const s = useGet<Source[]>("/sources");
  const inv = useGet<Inv[]>("/investigations");
  const usedBy: Record<string, string[]> = {};
  for (const i of inv.data ?? []) for (const sid of new Set([...i.source_ids, ...i.findings.map((f) => f.source_id)])) (usedBy[sid] ??= []).push(i.id);
  return (
    <Page eyebrow={t("so.eyebrow")} title={t("so.title")} sub={t("so.sub")}>
      <div className="flex gap-3 border border-line bg-surface p-4 text-[13px]" role="note">
        <Info size={18} className="mt-0.5 shrink-0 text-accent" aria-hidden="true" />
        <div className="space-y-2 leading-relaxed text-muted">
          <p><b className="font-semibold text-fg">{t("so.bannerTitle")}.</b> {t("so.banner")}</p>
          <p>{t("so.provenance")}</p>
        </div>
      </div>
      <Coverage />
      {s.error ? <ErrorBox error={s.error} retry={s.retry} /> : !s.data ? <PageSkeleton /> : <Library data={s.data} usedBy={usedBy} />}
      <Documents />
      <Context />
    </Page>
  );
}
