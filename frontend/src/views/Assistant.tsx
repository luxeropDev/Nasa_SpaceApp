import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowUp, History, Sparkles, Trash2 } from "lucide-react";
import { api } from "../api";
import type { Health } from "../api";
import { useI18n } from "../i18n";
import type { Key } from "../i18n";
import { Chip, ErrorBox, Skeleton } from "../components/ui";
import { LogoMark } from "../components/Logo";
import { useToast } from "../components/Toast";
import AnswerView from "./AnswerView";
import type { Ans } from "./AnswerView";

const SUGGEST: Key[] = ["as.s1", "as.s2", "as.s3", "as.s4", "as.s5"];
const HIST = "flamewise.history";
const MAX_TURNS = 6;

type Turn = { id: number; question: string; ans: Ans | null; err: unknown; busy: boolean };

function loadHistory(): string[] {
  try { const v = JSON.parse(localStorage.getItem(HIST) ?? "[]"); return Array.isArray(v) ? v.filter((x) => typeof x === "string").slice(0, 5) : []; } catch { return []; }
}

export default function Assistant({ params, health }: { params: URLSearchParams; health: { data: Health | null; error: unknown } }) {
  const { t, lang } = useI18n();
  const toast = useToast();
  const [q, setQ] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [hist, setHist] = useState<string[]>(loadHistory);
  const seq = useRef(0);
  const box = useRef<HTMLTextAreaElement>(null);
  const endRef = useRef<HTMLLIElement>(null);
  const busy = turns.some((x) => x.busy);

  const run = useCallback(async (id: number, question: string) => {
    setTurns((ts) => ts.map((x) => (x.id === id ? { ...x, busy: true, err: null } : x)));
    try {
      const r = await api.post<Ans>("/assistant", { question });
      setTurns((ts) => ts.map((x) => (x.id === id ? { ...x, ans: r, busy: false } : x)));
      if (r.llm_error) toast.push(t("as.llmError", { error: r.llm_error }), "error");
    } catch (e) {
      setTurns((ts) => ts.map((x) => (x.id === id ? { ...x, err: e, busy: false } : x)));
    }
  }, [t, toast]);

  const ask = useCallback((text: string) => {
    const question = text.trim();
    if (question.length < 3) return;
    const id = ++seq.current;
    setTurns((ts) => [...ts, { id, question, ans: null, err: null, busy: true }].slice(-MAX_TURNS));
    setQ("");
    setHist((h) => {
      const n = [question, ...h.filter((x) => x !== question)].slice(0, 5);
      try { localStorage.setItem(HIST, JSON.stringify(n)); } catch { /* history is optional */ }
      return n;
    });
    void run(id, question);
    window.setTimeout(() => endRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 40);
  }, [run]);

  // deep link: #/assistant?q=...
  const deep = params.get("q");
  const lastDeep = useRef<string | null>(null);
  useEffect(() => { if (deep && deep !== lastDeep.current) { lastDeep.current = deep; ask(deep); } }, [deep, ask]);
  // re-ask on language change so every answer in the thread follows the interface language
  const prevLang = useRef(lang);
  useEffect(() => {
    if (prevLang.current === lang) return;
    prevLang.current = lang;
    turns.forEach((x) => void run(x.id, x.question));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang]);
  // auto-grow the composer
  useEffect(() => { const el = box.current; if (el) { el.style.height = "auto"; el.style.height = Math.min(200, el.scrollHeight) + "px"; } }, [q]);

  const copy = async (a: Ans) => {
    try { await navigator.clipboard.writeText(`${a.direct_answer}\n\n${a.sources.map((s) => `${s.title}: ${s.url}`).join("\n")}`); toast.push(t("common.copied"), "success"); }
    catch { toast.push(t("common.copyFail"), "error"); }
  };

  const online = !!health.data;
  const status = !online ? (health.error ? { tone: "danger" as const, text: t("status.offline") } : { tone: "neutral" as const, text: t("top.checking") })
    : health.data!.llm_live ? { tone: "ok" as const, text: t("mode.live") } : { tone: "warn" as const, text: t("mode.demo") };

  return (
    <div className="mx-auto flex min-h-[calc(100vh-64px)] w-full max-w-[1240px] flex-col px-4 pt-6 sm:px-6 lg:px-8">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4">
        <div className="min-w-0">
          <h1 className="text-[22px] font-semibold tracking-tight text-fg sm:text-[26px]">{t("as.title")}</h1>
          <p className="mt-1 max-w-2xl text-[13px] text-muted">{t("as.sub")}</p>
        </div>
        <div className="flex items-center gap-2">
          <Chip tone={status.tone} title={t("as.statusHint")}><span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />{status.text}</Chip>
          {turns.length > 0 && <button className="btn btn-ghost btn-sm" onClick={() => setTurns([])}><Trash2 size={13} />{t("as.clear")}</button>}
        </div>
      </header>

      <div className="flex-1 py-6" aria-live="polite" aria-busy={busy}>
        {turns.length === 0 ? (
          <div className="mx-auto flex max-w-2xl flex-col items-center py-10 text-center sm:py-16">
            <span className="reveal relative grid h-16 w-16 place-items-center rounded-full border border-line bg-raised"><LogoMark size={34} className="text-accent" /></span>
            <h2 className="reveal d-1 mt-6 text-[26px] font-semibold tracking-tight text-fg sm:text-[32px]">{t("as.emptyTitle")}</h2>
            <p className="reveal d-2 mt-3 text-[14px] leading-relaxed text-muted">{t("as.empty")}</p>
            <ul className="reveal d-3 mt-8 grid w-full gap-2 text-left sm:grid-cols-2">
              {SUGGEST.map((k) => (
                <li key={k}><button className="panel panel-hover flex h-full w-full items-start gap-2.5 p-3.5 text-left text-[13px] text-fg" onClick={() => ask(t(k))}>
                  <Sparkles size={14} className="mt-0.5 shrink-0 text-brand" aria-hidden="true" />{t(k)}</button></li>
              ))}
            </ul>
            {hist.length > 0 && (
              <div className="reveal d-4 mt-6 w-full text-left">
                <p className="label mb-2 flex items-center gap-1.5"><History size={12} />{t("as.recent")}</p>
                <div className="flex flex-wrap gap-1.5">{hist.map((h) => <button key={h} className="chip max-w-full truncate transition-colors hover:border-line-strong hover:text-fg" onClick={() => ask(h)}>{h}</button>)}</div>
              </div>
            )}
          </div>
        ) : (
          <ol className="space-y-10">
            {turns.map((x, n) => (
              <li key={x.id} ref={n === turns.length - 1 ? endRef : undefined} className="scroll-mt-20 space-y-4">
                <div className="flex justify-end">
                  <p className="max-w-[85%] rounded-surface rounded-br-md bg-hover px-4 py-2.5 text-[14px] leading-relaxed text-fg">{x.question}</p>
                </div>
                {x.busy ? (
                  <div className="space-y-3" role="status" aria-label={t("as.loading")}>
                    <p className="flex items-center gap-2 text-[12.5px] text-muted"><LogoMark size={16} className="animate-pulse text-accent" />{t("as.loading")}…</p>
                    <Skeleton className="h-4 w-11/12" /><Skeleton className="h-4 w-9/12" /><Skeleton className="h-4 w-10/12" />
                  </div>
                ) : x.err != null ? <ErrorBox error={x.err} retry={() => void run(x.id, x.question)} />
                  : x.ans && <AnswerView ans={x.ans} onCopy={() => void copy(x.ans!)} onRetry={() => void run(x.id, x.question)} />}
              </li>
            ))}
          </ol>
        )}
      </div>

      <div className="no-print sticky bottom-0 -mx-4 bg-gradient-to-t from-bg via-bg to-bg/0 px-4 pb-4 pt-6 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        {turns.length > 0 && (
          <div className="mb-2 flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {SUGGEST.map((k) => <button key={k} className="chip shrink-0 transition-colors hover:border-line-strong hover:text-fg" onClick={() => ask(t(k))} disabled={busy}>{t(k)}</button>)}
          </div>
        )}
        <form className="flex items-end gap-2 rounded-surface border border-line-strong bg-surface p-2 shadow-pop transition focus-within:border-accent/50 focus-within:ring-[3px] focus-within:ring-accent/10"
          onSubmit={(e) => { e.preventDefault(); if (!busy) ask(q); }}>
          <label htmlFor="as-q" className="sr-only">{t("as.label")}</label>
          <textarea id="as-q" ref={box} rows={1} className="max-h-[200px] min-h-[40px] flex-1 resize-none bg-transparent px-2.5 py-2 text-[14px] leading-relaxed text-fg outline-none placeholder:text-subtle"
            placeholder={t("as.ph")} value={q} maxLength={800} onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); if (!busy) ask(q); } }} />
          <button className="grid h-10 w-10 shrink-0 place-items-center rounded-btn bg-fg text-bg transition hover:bg-fg/85 disabled:opacity-30" disabled={busy || q.trim().length < 3} aria-label={t("as.ask")}><ArrowUp size={18} /></button>
        </form>
        <p className="mt-1.5 px-1 text-[11px] text-subtle">{t("as.composerHint")}</p>
      </div>
    </div>
  );
}
