import { useRef } from "react";
import type { KeyboardEvent } from "react";
import { useI18n } from "../i18n";
import type { Lang } from "../i18n";

const LANGS: { code: Lang; short: string; name: string }[] = [
  { code: "en", short: "EN", name: "English" },
  { code: "ru", short: "RU", name: "Русский" },
];

/** Compact EN / RU control; arrow keys move between options (radiogroup pattern). */
export function LangSwitch() {
  const { lang, setLang, t } = useI18n();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft" && e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
    e.preventDefault();
    const idx = LANGS.findIndex((l) => l.code === lang);
    const next = (idx + (e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : LANGS.length - 1)) % LANGS.length;
    setLang(LANGS[next].code);
    refs.current[next]?.focus();
  };
  return (
    <div role="radiogroup" aria-label={t("top.lang.label")} onKeyDown={onKey} className="relative inline-grid h-9 shrink-0 grid-cols-2 border border-line-strong bg-transparent">
      {LANGS.map((l, i) => (
        <button key={l.code} ref={(el) => { refs.current[i] = el; }} type="button" role="radio" aria-checked={lang === l.code} tabIndex={lang === l.code ? 0 : -1}
          title={l.name} aria-label={l.name} onClick={() => setLang(l.code)}
          className={`relative min-w-[38px] border-r border-line-strong px-2.5 font-mono text-[11px] font-bold tracking-wider transition-colors last:border-r-0 ${lang === l.code ? "bg-fg text-bg" : "text-muted hover:bg-hover hover:text-fg"}`}>
          {l.short}
        </button>
      ))}
    </div>
  );
}
