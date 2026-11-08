import { useCallback, useEffect, useRef, useState } from "react";
import { Send, Sparkles } from "lucide-react";
import { api } from "../api";
import { useI18n } from "../i18n";
import type { Key } from "../i18n";
import { ErrorBox, Loading, Page } from "../components/ui";
import { useToast } from "../components/Toast";
import AnswerView from "./AnswerView";
import type { Ans } from "./AnswerView";

const SUGGEST: Key[] = ["as.s1", "as.s2", "as.s3", "as.s4", "as.s5"];
const HIST = "flamewise.history";

function loadHistory(): string[] {
  try { const v = JSON.parse(localStorage.getItem(HIST) ?? "[]"); return Array.isArray(v) ? v.filter((x) => typeof x === "string").slice(0, 5) : []; } catch { return []; }
}

export default function Assistant({ params }: { params: URLSearchParams }) {
  const { t, lang } = useI18n();
  const toast = useToast();
  const [q, setQ] = useState(params.get("q") ?? "");
  const [ans, setAns] = useState<Ans | null>(null);
  const [err, setErr] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [hist, setHist] = useState<string[]>(loadHistory);
  const last = useRef<string | null>(null);
  const seq = useRef(0);

  const ask = useCallback(async (text: string) => {
    const question = text.trim();
    if (question.length < 3) return;
    const my = ++seq.current;
    last.current = question;
    setQ(question); setBusy(true); setErr(null);
    try {
      const r = await api.post<Ans>("/assistant", { question });
      if (my !== seq.current) return;
      setAns(r);
      if (r.llm_error) toast.push(t("as.llmError", { error: r.llm_error }), "error");
      setHist((h) => {
        const n = [question, ...h.filter((x) => x !== question)].slice(0, 5);
        try { localStorage.setItem(HIST, JSON.stringify(n)); } catch { /* storage unavailable: history is optional */ }
        return n;
      });
    } catch (e) { if (my === seq.current) { setErr(e); setAns(null); } }
    if (my === seq.current) setBusy(false);
  }, [t, toast]);

  // deep link: #/assistant?q=...
  const deep = params.get("q");
  useEffect(() => { if (deep && deep !== last.current) void ask(deep); }, [deep, ask]);
  // re-ask on language change so the whole answer follows the interface language
  const prevLang = useRef(lang);
  useEffect(() => {
    if (prevLang.current === lang) return;
    prevLang.current = lang;
    if (last.current && ans) void ask(last.current);
  }, [lang, ans, ask]);

  const copy = async () => {
    if (!ans) return;
    try { await navigator.clipboard.writeText(`${ans.direct_answer}\n\n${ans.sources.map((s) => `${s.title}: ${s.url}`).join("\n")}`); toast.push(t("common.copied"), "success"); }
    catch { toast.push(t("common.copyFail"), "error"); }
  };

  return (
    <Page title={t("as.title")} sub={t("as.sub")}>
      <div className="panel p-4">
        <form className="flex flex-col gap-2 sm:flex-row" onSubmit={(e) => { e.preventDefault(); void ask(q); }}>
          <label htmlFor="as-q" className="sr-only">{t("as.label")}</label>
          <input id="as-q" className="input flex-1" placeholder={t("as.ph")} value={q} onChange={(e) => setQ(e.target.value)} maxLength={800} autoComplete="off" />
          <button className="btn btn-primary sm:w-28" disabled={busy || q.trim().length < 3}><Send size={14} />{t("as.ask")}</button>
        </form>
        <p className="label mb-2 mt-4">{t("as.suggest")}</p>
        <div className="flex flex-wrap gap-2">{SUGGEST.map((k) => <button key={k} className="chip transition hover:border-accent/50 hover:text-accent" onClick={() => void ask(t(k))}><Sparkles size={11} aria-hidden="true" />{t(k)}</button>)}</div>
        {hist.length > 0 && (<><p className="label mb-2 mt-4">{t("as.recent")}</p><div className="flex flex-wrap gap-2">{hist.map((h) => <button key={h} className="chip transition hover:border-accent/50 hover:text-accent" onClick={() => void ask(h)}>{h}</button>)}</div></>)}
      </div>
      {busy && <Loading text={t("as.loading")} />}
      {err != null && !busy && <ErrorBox error={err} retry={() => void ask(last.current ?? q)} />}
      {!ans && !busy && err == null && <div className="panel p-10 text-center text-sm text-muted">{t("as.empty")}</div>}
      {ans && !busy && <AnswerView ans={ans} onCopy={() => void copy()} />}
    </Page>
  );
}
