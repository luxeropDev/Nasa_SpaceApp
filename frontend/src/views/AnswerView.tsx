import { useMemo, useRef, useState } from "react";
import { AlertTriangle, ChevronDown, Copy, FileSearch, RotateCcw } from "lucide-react";
import { Chip, EpistemicTag } from "../components/ui";
import { SourceLink } from "../components/research/SourceLink";
import type { Key } from "../i18n";
import Markdown from "../components/assistant/Markdown";
import type { LinkKind } from "../api";
import { CitationBlock, ClaimTag } from "../components/research/Evidence";
import type { ClaimType } from "../components/research/Evidence";

export type EvidenceItem = {
  id: string; kind: "curated_finding" | "psi_record" | "document_passage"; investigation_id: string | null; text: string; verbatim: boolean; verification: string;
  title: string; organization: string | null; year: string | null; url: string; doi: string | null; page: number | null; section: string | null; source_id: string | null; doc_id?: string;
};
export type Claim = { type: ClaimType; text: string; evidence: string[]; supported: boolean; context_id?: string };
import { useI18n } from "../i18n";
import { href } from "../nav";

export type Ans = {
  mode: string; llm_used: boolean; llm_error: string | null; insufficient_evidence: boolean; direct_answer: string;
  investigations: { id: string; acronym: string; full_name: string; objective: string; bm25: number }[];
  evidence: { investigation_id: string; citation: string; text: string; source_id: string; source_url: string }[];
  interpretation: string; exploration_relevance: string; knowledge_gaps: string[];
  sources: { id: string; title: string; url: string; type: string; link_kind: LinkKind; publisher: string }[]; pipeline: string[];
  evidence_items?: EvidenceItem[]; claims?: Claim[]; safety_note?: string;
};

const Section = ({ title, tag, children }: { title: string; tag?: React.ReactNode; children: React.ReactNode }) => (
  <section className="border-t border-line pt-4">
    <div className="mb-2 flex flex-wrap items-center gap-2"><h3 className="text-[13px] font-semibold text-fg">{title}</h3>{tag}</div>
    {children}
  </section>
);

/**
 * One assistant answer. Inline [citations] become numbered, clickable markers that highlight the exact evidence
 * excerpt (and its source) in the "Sources supporting this answer" panel. Nothing here invents a citation:
 * only tokens that match a retrieved evidence record or investigation id become markers.
 */
export default function AnswerView({ ans, onCopy, onRetry }: { ans: Ans; onCopy: () => void; onRetry: () => void }) {
  const { t } = useI18n();
  const [focus, setFocus] = useState<string | null>(null);
  const aside = useRef<HTMLDivElement>(null);
  const invIds = useMemo(() => new Set(ans.investigations.map((i) => i.id)), [ans]);
  const acr = useMemo(() => Object.fromEntries(ans.investigations.map((i) => [i.id, i.acronym])), [ans]);

  // citation key -> marker number, in order of first appearance across the answer text
  const order = useMemo(() => {
    const m = new Map<string, number>();
    for (const txt of [ans.direct_answer, ans.interpretation]) {
      for (const x of txt.matchAll(/\[([^\]\n]{1,120})\]/g)) {
        const k = x[1];
        if (!m.has(k) && (invIds.has(k) || ans.evidence.some((e) => e.citation === `[${k}]`))) m.set(k, m.size + 1);
      }
    }
    return m;
  }, [ans, invIds]);
  const items = ans.evidence_items ?? [];
  const claims = ans.claims ?? [];
  // a focus key is either an evidence id ("E3"), an investigation id, or a legacy inline citation token
  const matches = (k: string, e: EvidenceItem) => e.id === k || e.investigation_id === k
    || (e.kind === "curated_finding" && ans.evidence.some((x) => x.citation === `[${k}]` && x.investigation_id === e.investigation_id && x.text === e.text));

  const open = (k: string) => {
    setFocus(k);
    window.setTimeout(() => aside.current?.querySelector<HTMLElement>("[data-hit='1']")?.scrollIntoView({ block: "nearest", behavior: "smooth" }), 30);
  };
  const cite = (token: string, key: string) => {
    const n = order.get(token);
    if (!n) return null;
    const label = invIds.has(token) ? acr[token] : token;
    return (
      <button key={key} type="button" onClick={() => open(token)} aria-label={t("as.citeOpen", { n, name: label })} title={label}
        className={`mx-0.5 inline-flex h-[18px] min-w-[18px] -translate-y-px items-center justify-center rounded-[5px] border px-1 align-middle font-mono text-[10.5px] font-semibold transition-colors ${focus === token ? "border-accent bg-accent text-on-accent" : "border-accent/35 bg-accent/10 text-accent hover:bg-accent/20"}`}>
        {n}
      </button>
    );
  };

  const kindTag = ans.llm_used ? <EpistemicTag kind="ai" /> : <EpistemicTag kind="rule" />;
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_330px]">
      <div className="min-w-0 space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Chip tone={ans.llm_used ? "ok" : "warn"}>{ans.llm_used ? t("as.badge.live") : t("as.badge.demo")}</Chip>
          {ans.llm_used && <span className="font-mono text-[11px] text-subtle">{ans.mode}</span>}
          <span className="ml-auto flex gap-1">
            <button className="btn btn-ghost btn-sm" onClick={onRetry} title={t("as.retry")}><RotateCcw size={13} /><span className="sr-only sm:not-sr-only">{t("as.retry")}</span></button>
            <button className="btn btn-ghost btn-sm" onClick={onCopy}><Copy size={13} /><span className="sr-only sm:not-sr-only">{t("as.copy")}</span></button>
          </span>
        </div>
        {ans.llm_error && <p className="flex items-start gap-2 rounded-ctl border border-warn/30 bg-warn/[.06] px-3 py-2 text-[12.5px] text-warn" role="status"><AlertTriangle size={14} className="mt-0.5 shrink-0" />{t("as.llmError", { error: ans.llm_error })}</p>}

        <section>
          <div className="mb-2 flex flex-wrap items-center gap-2"><h3 className="text-[13px] font-semibold text-fg">{t("as.sec1")}</h3>{kindTag}</div>
          <Markdown text={ans.direct_answer} cite={cite} className="text-[15px] leading-[1.7] text-fg" />
          {ans.insufficient_evidence && <p className="mt-3 flex items-center gap-2 rounded-ctl border border-danger/25 bg-danger/[.06] px-3 py-2 text-[12.5px] text-danger"><AlertTriangle size={14} />{t("as.insufficient")}</p>}
          {order.size > 0 && <p className="mt-2 text-[11.5px] text-subtle">{t("as.citeHint")}</p>}
        </section>

        {claims.length > 0 && (
          <Section title={t("v4.as.claims")} tag={<span className="text-[11px] text-subtle">{t("v4.as.claimsSub")}</span>}>
            <ul className="space-y-3">
              {claims.map((c, k) => (
                <li key={k} className="grid gap-x-3 gap-y-1 sm:grid-cols-[150px_1fr]">
                  <span className="flex items-start gap-1.5"><ClaimTag type={c.type} /></span>
                  <div className="min-w-0">
                    <p className={`text-[13.5px] leading-relaxed ${c.type === "EVIDENCE" ? "text-fg" : "text-muted"}`}>{c.type === "EVIDENCE" ? <>“{c.text}”</> : c.text}</p>
                    <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-subtle">
                      {c.evidence.map((id) => (
                        <button key={id} type="button" onClick={() => open(id)} className={`rounded-[4px] border px-1 font-mono ${focus === id ? "border-accent bg-accent text-on-accent" : "border-accent/35 bg-accent/10 text-accent hover:bg-accent/20"}`}>{id}</button>
                      ))}
                      {c.type === "EVIDENCE" ? <span>{c.supported ? t("v4.as.supported") : t("v4.as.unsupported")}</span> : c.evidence.length === 0 && <span>{t("v4.as.noDirect")}</span>}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
            {ans.safety_note && <p className="mt-3 rounded-ctl border border-dashed border-line-strong px-3 py-2 text-[11.5px] leading-relaxed text-subtle">{ans.safety_note}</p>}
          </Section>
        )}

        {ans.investigations.length > 0 && (
          <Section title={t("as.sec2")} tag={<span className="font-mono text-[10.5px] text-subtle">{t("as.retrievedBy")}</span>}>
            <ul className="flex flex-wrap gap-2">{ans.investigations.map((i) => (
              <li key={i.id}><a href={href("explorer", i.id)} className="group inline-flex items-center gap-2 rounded-ctl border border-line bg-raised px-2.5 py-1.5 text-[12.5px] transition-colors hover:border-line-strong hover:bg-hover" title={i.full_name}>
                <span className="font-semibold text-fg group-hover:text-accent">{i.acronym}</span>
                {i.bm25 > 0 && <span className="font-mono text-[10.5px] text-subtle">{t("as.bm25", { score: i.bm25 })}</span>}
              </a></li>))}</ul>
          </Section>
        )}
        {ans.investigations.length > 0 && (
          <Section title={t("as.sec4")} tag={kindTag}>
            <Markdown text={ans.interpretation} cite={cite} className="prose-sm-fg" />
          </Section>
        )}
        {ans.exploration_relevance && (
          <Section title={t("as.sec5")} tag={<EpistemicTag kind="assumption" />}><p className="prose-sm-fg">{ans.exploration_relevance}</p></Section>
        )}
        {ans.investigations.length === 0 && ans.interpretation && <p className="prose-sm-fg">{ans.interpretation}</p>}
        <Section title={t("as.sec6")} tag={<EpistemicTag kind="missing" />}>
          <ul className="space-y-1.5 text-[13px] leading-relaxed text-muted">{ans.knowledge_gaps.map((g) => <li key={g} className="flex gap-2.5"><span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-warn" aria-hidden="true" />{g}</li>)}</ul>
        </Section>
        <details className="group border-t border-line pt-3 text-[12px] text-subtle">
          <summary className="flex cursor-pointer list-none items-center gap-1.5 hover:text-fg"><ChevronDown size={13} className="transition-transform group-open:rotate-180" />{t("as.pipeline")}</summary>
          <ol className="mt-2 space-y-1 pl-5 font-mono text-[11px] [list-style:decimal]">{ans.pipeline.map((p) => <li key={p}>{p}</li>)}</ol>
        </details>
      </div>

      <aside ref={aside} className="min-w-0 lg:sticky lg:top-20 lg:max-h-[calc(100vh-7rem)] lg:self-start lg:overflow-y-auto" aria-label={t("as.sources.title")}>
        <div className="rounded-card border border-line bg-raised/60 p-4">
          <div className="flex items-center gap-2"><FileSearch size={15} className="text-accent" aria-hidden="true" /><h3 className="text-[13px] font-semibold text-fg">{t("as.sources.title")}</h3></div>
          <p className="mt-1 text-[11.5px] leading-relaxed text-subtle">{t("as.sources.sub")}</p>
          {items.length === 0 ? <p className="mt-4 text-[12.5px] text-muted">{t("as.noSources")}</p> : (
            <ol className="mt-3 space-y-2">
              {items.map((e) => {
                const hit = focus !== null && matches(focus, e);
                return (
                  <li key={e.id} data-hit={hit ? "1" : "0"} className={`rounded-ctl border p-3 transition-colors duration-200 ${hit ? "border-accent/60 bg-accent/[.07]" : "border-line bg-surface"}`}>
                    <p className="mb-1.5 flex items-center justify-between gap-2 text-[11px] text-subtle">
                      <span>{t(`v4.ek.${e.kind}` as Key)}</span>
                      {e.investigation_id && <a href={href("explorer", e.investigation_id)} className="font-mono text-[11px] text-accent hover:underline">{acr[e.investigation_id] ?? e.investigation_id}</a>}
                    </p>
                    <CitationBlock id={e.id} title={e.title} org={e.organization} year={e.year} url={e.url} doi={e.doi} page={e.page} section={e.section}
                      excerpt={e.verbatim ? `“${e.text}”` : e.text} verification={e.verification} />
                  </li>
                );
              })}
            </ol>
          )}
          {ans.sources.length > 0 && (
            <div className="mt-4 border-t border-line pt-3">
              <p className="label mb-2 !text-[9.5px]">{t("as.sec7")}</p>
              <ul className="space-y-2">{ans.sources.map((s) => <li key={s.id}><SourceLink title={s.title} url={s.url} kind={s.link_kind} compact /></li>)}</ul>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
