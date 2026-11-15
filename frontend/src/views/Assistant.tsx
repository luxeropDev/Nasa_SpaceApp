import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowUp, History, Trash2 } from "lucide-react";
import { api } from "../api";
import type { Health } from "../api";
import { useI18n } from "../i18n";
import type { Key } from "../i18n";
import { Chip, EpistemicTag, ErrorBox, Skeleton, Spinner } from "../components/ui";
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
    <div className="mx-auto flex min-h-[calc(100vh-64px)] w-full max-w-[1400px] flex-col bg-white px-4 pb-10 pt-8 sm:px-6 lg:min-h-[calc(100vh-80px)] lg:px-10 lg:pt-10">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-line pb-6">
        <div className="min-w-0">
          <p className="eyebrow mb-1.5">{t("as2.kicker")}</p>
          <h1 className="font-display text-[34px] font-bold tracking-[-.035em] text-fg sm:text-[42px]">{t("as.title")}</h1>
          <p className="mt-2 max-w-2xl text-[14px] text-muted">{t("as.sub")}</p>
        </div>
        <div className="flex items-center gap-2">
          <Chip tone={status.tone} title={t("as.statusHint")}><span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />{status.text}</Chip>
          {turns.length > 0 && <button className="btn btn-ghost btn-sm" onClick={() => setTurns([])}><Trash2 size={13} />{t("as.clear")}</button>}
        </div>
      </header>

      <div className="no-print sticky top-16 z-20 -mx-4 border-b border-line bg-white/95 px-4 py-4 backdrop-blur-sm sm:-mx-6 sm:px-6 lg:top-20 lg:-mx-10 lg:px-10">
        <form className="mx-auto flex max-w-4xl items-end gap-2 border border-line-strong bg-surface p-2 transition focus-within:border-accent"
          onSubmit={(e) => { e.preventDefault(); if (!busy) ask(q); }}>
          <label htmlFor="as-q" className="sr-only">{t("as.label")}</label>
          <textarea id="as-q" ref={box} rows={1} className="max-h-[200px] min-h-[44px] flex-1 resize-none bg-transparent px-3 py-2.5 text-[15px] leading-relaxed text-fg outline-none placeholder:text-subtle"
            placeholder={t("as.ph")} value={q} maxLength={800} onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); if (!busy) ask(q); } }} />
          <button className="grid h-11 w-11 shrink-0 place-items-center bg-accent text-on-accent transition hover:bg-accent/90 disabled:opacity-30" disabled={busy || q.trim().length < 3} aria-label={t("as.ask")}><ArrowUp size={18} /></button>
        </form>
        <p className="mx-auto mt-1.5 max-w-4xl px-1 text-[11px] text-subtle">{t("as.composerHint")}</p>
      </div>

      <div className="mx-auto w-full max-w-5xl flex-1 py-7" aria-live="polite" aria-busy={busy}>
        {turns.length === 0 ? (
          <div className="py-2">
            <div className="min-w-0">
              <h2 className="font-display text-[24px] font-bold text-fg">{t("as.emptyTitle")}</h2>
              <p className="label mb-2 mt-6">{t("as2.examples")}</p>
              <ul className="divide-y divide-line border-y border-line">
                {SUGGEST.map((k, n) => (
                  <li key={k}><button className="group flex w-full items-start gap-3 py-2.5 text-left text-[13.5px] text-fg transition-colors hover:bg-hover" onClick={() => ask(t(k))}>
                    <span className="mt-px font-mono text-[11px] text-subtle">Q{n + 1}</span><span className="flex-1 group-hover:text-accent">{t(k)}</span></button></li>
                ))}
              </ul>
              {hist.length > 0 && (
                <div className="mt-6">
                  <p className="label mb-2 flex items-center gap-1.5"><History size={12} />{t("as.recent")}</p>
                  <div className="flex flex-wrap gap-1.5">{hist.map((h) => <button key={h} className="chip max-w-full truncate transition-colors hover:border-line-strong hover:text-fg" onClick={() => ask(h)}>{h}</button>)}</div>
                </div>
              )}
            </div>
            <details className="mt-8 border-t border-line pt-4 text-[12.5px] leading-relaxed text-muted">
              <summary className="cursor-pointer font-semibold text-fg">{t("as2.method")}</summary>
              <ol className="space-y-2">
                {(["as2.m1", "as2.m2", "as2.m3", "as2.m4"] as Key[]).map((k, n) => <li key={k} className="grid grid-cols-[18px_1fr] gap-2"><span className="font-mono text-[11px] text-subtle">{n + 1}.</span><span>{t(k)}</span></li>)}
              </ol>
              <p className="mt-3 border-t border-line pt-3 text-[11.5px] text-subtle">{t("as2.legend")}</p>
              <p className="mt-2 flex flex-wrap gap-1.5"><EpistemicTag kind="record" /><EpistemicTag kind="ai" /><EpistemicTag kind="rule" /><EpistemicTag kind="assumption" /><EpistemicTag kind="missing" /></p>
            </details>
          </div>
        ) : (
          <ol className="space-y-10">
            {turns.map((x, n) => (
              <li key={x.id} ref={n === turns.length - 1 ? endRef : undefined} className="scroll-mt-20 space-y-4">
                <div className="border-l-2 border-accent bg-surface px-4 py-2.5">
                  <p className="font-mono text-[10.5px] uppercase tracking-[.06em] text-subtle">{t("as2.query")} · Q{n + 1}</p>
                  <p className="mt-0.5 text-[14.5px] leading-relaxed text-fg">{x.question}</p>
                </div>
                {x.busy ? (
                  <div className="space-y-3" role="status" aria-label={t("as.loading")}>
                    <p className="flex items-center gap-2 text-[12.5px] text-muted"><Spinner size={14} />{t("as.loading")}…</p>
                    <Skeleton className="h-4 w-11/12" /><Skeleton className="h-4 w-9/12" /><Skeleton className="h-4 w-10/12" />
                  </div>
                ) : x.err != null ? <ErrorBox error={x.err} retry={() => void run(x.id, x.question)} />
                  : x.ans && <AnswerView ans={x.ans} onCopy={() => void copy(x.ans!)} onRetry={() => void run(x.id, x.question)} />}
              </li>
            ))}
          </ol>
        )}
      </div>

    </div>
  );
}
