import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { useI18n } from "../i18n";

const FOCUSABLE = 'a[href],button:not([disabled]),input,select,textarea,[tabindex]:not([tabindex="-1"])';

/** Accessible modal: focus trap, Esc to close, scroll lock, focus restore, animated backdrop. */
export function Dialog({ open, onClose, title, description, children, wide = false }: { open: boolean; onClose: () => void; title: string; description?: string; children: ReactNode; wide?: boolean }) {
  const { t } = useI18n();
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    box.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.stopPropagation(); onClose(); return; }
      if (e.key !== "Tab" || !box.current) return;
      const els = Array.from(box.current.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (!els.length) return;
      const first = els[0], last = els[els.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = overflow; prev?.focus(); };
  }, [open, onClose]);

  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-[60] grid place-items-center p-4">
      <div className="absolute inset-0 bg-[#05070C]/70" style={{ animation: "fadeIn .2s ease-out both" }} onClick={onClose} aria-hidden="true" />
      <div ref={box} role="dialog" aria-modal="true" aria-label={title} className={`relative max-h-[88vh] w-full overflow-y-auto rounded-surface border border-line-strong bg-surface p-5 shadow-pop sm:p-6 ${wide ? "max-w-xl" : "max-w-md"}`} style={{ animation: "dialog-in .26s cubic-bezier(0.16,1,0.3,1) both" }}>
        <div className="mb-4 flex items-start justify-between gap-3">
          <div><h2 className="text-[17px] font-semibold text-fg">{title}</h2>{description && <p className="mt-1 text-[12.5px] leading-relaxed text-subtle">{description}</p>}</div>
          <button className="icon-btn !h-8 !w-8" onClick={onClose} aria-label={t("status.close")}><X size={16} /></button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}
