import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { useI18n } from "../i18n";

const FOCUSABLE = 'a[href],button:not([disabled]),input,select,textarea,[tabindex]:not([tabindex="-1"])';

/** Accessible modal: focus trap, Esc to close, scroll lock, focus restore, animated backdrop. */
export function Dialog({ open, onClose, title, description, children }: { open: boolean; onClose: () => void; title: string; description?: string; children: ReactNode }) {
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
      <div className="absolute inset-0 bg-black/55 backdrop-blur-[2px]" style={{ animation: "backdrop-in .2s ease-out both" }} onClick={onClose} aria-hidden="true" />
      <div ref={box} role="dialog" aria-modal="true" aria-label={title} className="panel relative w-full max-w-md p-5 shadow-pop" style={{ animation: "dialog-in .24s cubic-bezier(.2,.8,.2,1) both" }}>
        <div className="mb-4 flex items-start justify-between gap-3">
          <div><h2 className="text-base font-semibold text-fg">{title}</h2>{description && <p className="mt-0.5 text-xs text-subtle">{description}</p>}</div>
          <button className="btn btn-ghost !p-1.5" onClick={onClose} aria-label={t("status.close")}><X size={16} /></button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}
