import { AlertTriangle, Copy } from "lucide-react";
import { Chip, Ext, Panel } from "../components/ui";
import { useI18n } from "../i18n";
import { href } from "../nav";

export type Ans = {
  mode: string; llm_used: boolean; llm_error: string | null; insufficient_evidence: boolean; direct_answer: string;
  investigations: { id: string; acronym: string; full_name: string; objective: string; bm25: number }[];
  evidence: { investigation_id: string; citation: string; text: string; source_url: string }[];
  interpretation: string; exploration_relevance: string; knowledge_gaps: string[];
  sources: { id: string; title: string; url: string; type: string }[]; pipeline: string[];
};

const H = ({ n, t }: { n: number; t: string }) => (
  <h3 className="label mb-2 flex items-center gap-2 text-accent"><span className="grid h-5 w-5 place-items-center rounded-full bg-accent/10 font-mono text-[10px]">{n}</span>{t}</h3>
);

/** Renders the 7-section structured answer. Presentation only; all content comes from the backend. */
export default function AnswerView({ ans, onCopy }: { ans: Ans; onCopy: () => void }) {
  const { t } = useI18n();
  return (
    <div className="stagger space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Chip tone={ans.llm_used ? "ok" : "warn"}>{ans.mode}</Chip>
        <button className="btn btn-ghost !py-1 text-xs" onClick={onCopy}><Copy size={13} />{t("as.copy")}</button>
      </div>
      <Panel>
        <H n={1} t={t("as.sec1")} />
        <p className="text-[15px] leading-relaxed text-fg">{ans.direct_answer}</p>
        {ans.insufficient_evidence && <p className="mt-3 flex items-center gap-2 text-xs text-warn"><AlertTriangle size={14} />{t("as.insufficient")}</p>}
      </Panel>
      {ans.investigations.length > 0 && (<>
        <Panel><H n={2} t={t("as.sec2")} />
          <ul className="grid gap-2 md:grid-cols-2">{ans.investigations.map((i) => (
            <li key={i.id}><a href={href("explorer", i.id)} className="panel-hover block rounded-xl border border-line bg-raised/40 p-3">
              <div className="flex items-center justify-between gap-2"><span className="text-sm font-semibold text-fg">{i.acronym}</span><span className="label">{t("as.bm25", { score: i.bm25 })}</span></div>
              <div className="mt-0.5 text-xs text-subtle">{i.full_name}</div></a></li>))}</ul>
        </Panel>
        <Panel><H n={3} t={t("as.sec3")} />
          <ul className="space-y-3">{ans.evidence.map((e, k) => <li key={k} className="text-sm leading-relaxed text-muted"><span className="mr-1.5 font-mono text-xs text-accent">{e.citation}</span>{e.text} <span className="text-xs"><Ext href={e.source_url}>{t("common.source")}</Ext></span></li>)}</ul>
        </Panel>
        <div className="grid gap-3 md:grid-cols-2">
          <Panel><H n={4} t={t("as.sec4")} /><p className="prose-sm-fg">{ans.interpretation}</p></Panel>
          <Panel><H n={5} t={t("as.sec5")} /><p className="prose-sm-fg">{ans.exploration_relevance || "\u2014"}</p></Panel>
        </div>
      </>)}
      <Panel><H n={6} t={t("as.sec6")} />
        <ul className="list-disc space-y-1.5 pl-4 text-sm leading-relaxed text-muted marker:text-warn">{ans.knowledge_gaps.map((g) => <li key={g}>{g}</li>)}</ul>
      </Panel>
      <Panel><H n={7} t={t("as.sec7")} />
        {ans.sources.length === 0 ? <p className="text-sm text-muted">{t("as.noSources")}</p> : <ul className="space-y-1.5 text-sm">{ans.sources.map((s) => <li key={s.id}><span className="mr-2 text-xs text-subtle">{s.type}</span><Ext href={s.url}>{s.title}</Ext></li>)}</ul>}
        <p className="label mt-4 !normal-case !tracking-normal">{t("as.pipeline")}: {ans.pipeline.join(" \u2192 ")}</p>
      </Panel>
    </div>
  );
}
