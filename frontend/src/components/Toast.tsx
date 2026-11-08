import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info, X } from "lucide-react";
import { useI18n } from "../i18n";

type Kind = "success" | "error" | "info";
type Item = { id: number; kind: Kind; text: string };
const Ctx = createContext<{ push: (text: string, kind?: Kind) => void } | null>(null);

const ICON = { success: CheckCircle2, error: AlertTriangle, info: Info } as const;
const TONE = { success: "text-ok", error: "text-warn", info: "text-accent" } as const;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Item[]>([]);
  const seq = useRef(0);
  const { t } = useI18n();
  const dismiss = useCallback((id: number) => setItems((l) => l.filter((x) => x.id !== id)), []);
  const push = useCallback((text: string, kind: Kind = "info") => {
    const id = ++seq.current;
    setItems((l) => [...l.slice(-3), { id, kind, text }]);
    window.setTimeout(() => dismiss(id), kind === "error" ? 6500 : 3800);
  }, [dismiss]);
  const value = useMemo(() => ({ push }), [push]);
  return (
    <Ctx.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[70] flex flex-col items-center gap-2 px-4" aria-live="polite" aria-atomic="false">
        {items.map((i) => {
          const I = ICON[i.kind];
          return (
            <div key={i.id} role={i.kind === "error" ? "alert" : "status"} className="pointer-events-auto flex max-w-md items-start gap-2.5 rounded-xl border border-line bg-surface px-3.5 py-2.5 text-sm text-fg shadow-pop" style={{ animation: "toast-in .22s ease-out both" }}>
              <I size={16} className={`mt-0.5 shrink-0 ${TONE[i.kind]}`} />
              <span className="min-w-0 flex-1">{i.text}</span>
              <button className="rounded p-0.5 text-subtle hover:text-fg" onClick={() => dismiss(i.id)} aria-label={t("status.close")}><X size={14} /></button>
            </div>
          );
        })}
      </div>
    </Ctx.Provider>
  );
}

export function useToast() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useToast must be used inside <ToastProvider>");
  return c;
}
