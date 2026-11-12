import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowRight, CornerDownLeft, FlaskConical, Search, Sparkles } from "lucide-react";
import { api } from "../../api";
import type { Inv } from "../../api";
import { useI18n } from "../../i18n";
import type { Key } from "../../i18n";
import { VIEWS, go, href } from "../../nav";
import { Spinner } from "../ui";
import { ICONS } from "./navItems";

type Item = { id: string; kind: "page" | "record" | "ask"; label: string; sub?: string; to: string; icon: typeof Search };

/** Global search palette (Ctrl/⌘+K): pages, BM25 record search via the backend, and "ask the assistant". */
export default function CommandSearch({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useI18n();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Inv[]>([]);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [sel, setSel] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);

  useEffect(() => {
    if (!open) return;
    setQ(""); setHits([]); setSel(0); setFailed(false);
    const prev = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.setTimeout(() => input.current?.focus(), 0);
    return () => { document.body.style.overflow = overflow; prev?.focus?.(); };
  }, [open]);

  // debounced backend BM25 search
  useEffect(() => {
    if (!open) return;
    const query = q.trim();
    if (!query) { setHits([]); setBusy(false); return; }
    setBusy(true);
    let on = true;
    const timer = window.setTimeout(() => {
      api.post<{ investigation: Inv }[]>("/search", { query, limit: 6 })
        .then((r) => { if (on) { setHits(r.map((x) => x.investigation)); setFailed(false); } })
        .catch(() => { if (on) { setHits([]); setFailed(true); } })
        .finally(() => on && setBusy(false));
    }, 180);
    return () => { on = false; window.clearTimeout(timer); };
  }, [q, open]);

  const items = useMemo<Item[]>(() => {
    const ql = q.trim().toLowerCase();
    const pages: Item[] = VIEWS.map((v) => ({ id: "p:" + v, kind: "page" as const, label: t(`nav.${v}` as Key), sub: t(`nav.${v}.desc` as Key), to: href(v), icon: ICONS[v] }))
      .filter((p) => !ql || p.label.toLowerCase().includes(ql) || (p.sub ?? "").toLowerCase().includes(ql));
    const recs: Item[] = hits.map((i) => ({ id: "r:" + i.id, kind: "record", label: `${i.acronym} — ${i.full_name}`, sub: i.id, to: href("explorer", i.id), icon: FlaskConical }));
    const ask: Item[] = q.trim().length >= 3 ? [{ id: "ask", kind: "ask", label: t("cmd.ask", { q: q.trim() }), to: href("assistant", null, { q: q.trim() }), icon: Sparkles }] : [];
    return [...recs, ...pages.slice(0, ql ? 4 : 9), ...ask];
  }, [q, hits, t]);

  useEffect(() => { setSel(0); }, [items.length]);
  useEffect(() => { list.current?.querySelector<HTMLElement>(`[data-i="${sel}"]`)?.scrollIntoView({ block: "nearest" }); }, [sel]);

  const choose = (it?: Item) => { if (!it) return; onClose(); go(it.to); };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") { e.preventDefault(); onClose(); }
    else if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(items.length - 1, s + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(0, s - 1)); }
    else if (e.key === "Enter") { e.preventDefault(); choose(items[sel]); }
    else if (e.key === "Tab") e.preventDefault(); // keep focus in the palette
  };

  if (!open) return null;
  let lastKind = "";
  return createPortal(
    <div className="fixed inset-0 z-[65] flex items-start justify-center px-3 pt-[10vh]" onKeyDown={onKey}>
      <div className="absolute inset-0 bg-[#05070C]/70 backdrop-blur-sm" style={{ animation: "fadeIn .18s ease-out both" }} onClick={onClose} aria-hidden="true" />
      <div role="dialog" aria-modal="true" aria-label={t("cmd.title")} className="relative w-full max-w-xl overflow-hidden rounded-surface border border-line-strong bg-surface shadow-pop" style={{ animation: "dialog-in .24s cubic-bezier(0.16,1,0.3,1) both" }}>
        <div className="flex items-center gap-3 border-b border-line px-4">
          <Search size={17} className="shrink-0 text-subtle" aria-hidden="true" />
          <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("cmd.ph")} aria-label={t("cmd.title")}
            role="combobox" aria-expanded="true" aria-controls="cmd-list" aria-activedescendant={items[sel] ? `cmd-${sel}` : undefined}
            className="h-14 min-w-0 flex-1 bg-transparent text-[15px] text-fg outline-none placeholder:text-subtle" autoComplete="off" spellCheck={false} />
          {busy ? <Spinner size={15} /> : <span className="kbd hidden sm:inline">Esc</span>}
        </div>
        <ul id="cmd-list" ref={list} role="listbox" aria-label={t("cmd.results")} className="max-h-[56vh] overflow-y-auto p-2">
          {failed && <li className="px-3 py-2 text-xs text-danger" role="presentation">{t("ex.searchError")}</li>}
          {items.length === 0 && !busy && <li className="px-3 py-8 text-center text-[13px] text-subtle" role="presentation">{t("cmd.empty")}</li>}
          {items.map((it, i) => {
            const head = it.kind !== lastKind ? (lastKind = it.kind) : null;
            const I = it.icon;
            return (
              <li key={it.id} role="presentation">
                {head && <p className="label px-3 pb-1 pt-2.5 !text-[9.5px]" aria-hidden="true">{t(`cmd.g.${it.kind}`)}</p>}
                <div id={`cmd-${i}`} data-i={i} role="option" aria-selected={sel === i} onMouseMove={() => setSel(i)} onClick={() => choose(it)}
                  className={`flex cursor-pointer items-center gap-3 rounded-btn px-3 py-2.5 transition-colors ${sel === i ? "bg-hover" : ""}`}>
                  <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-ctl border border-line ${it.kind === "ask" ? "text-brand" : "text-accent"}`}><I size={15} aria-hidden="true" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] text-fg">{it.label}</span>
                    {it.sub && <span className={`block truncate text-[11.5px] text-subtle ${it.kind === "record" ? "font-mono" : ""}`}>{it.sub}</span>}
                  </span>
                  {sel === i ? <CornerDownLeft size={14} className="shrink-0 text-subtle" aria-hidden="true" /> : <ArrowRight size={14} className="shrink-0 text-transparent" aria-hidden="true" />}
                </div>
              </li>
            );
          })}
        </ul>
        <div className="flex items-center justify-between gap-3 border-t border-line px-4 py-2 text-[11px] text-subtle">
          <span>{t("cmd.hint")}</span><span className="font-mono">BM25</span>
        </div>
      </div>
    </div>,
    document.body,
  );
}
