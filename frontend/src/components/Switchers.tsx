import { useRef } from "react";
import type { KeyboardEvent } from "react";
import { Moon, Sun } from "lucide-react";
import { useI18n } from "../i18n";
import type { Lang } from "../i18n";
import { useTheme } from "../theme";

/** Animated sun/moon toggle. Both icons are stacked and cross-rotate; respects reduced motion via global CSS. */
export function ThemeSwitch() {
  const { theme, toggle } = useTheme();
  const { t } = useI18n();
  const dark = theme === "dark";
  const label = dark ? t("top.theme.toLight") : t("top.theme.toDark");
  return (
    <button type="button" onClick={toggle} role="switch" aria-checked={dark} aria-label={label} title={label}
      className="group relative h-9 w-[68px] shrink-0 rounded-full border border-line bg-raised p-1 transition-colors hover:border-accent/50">
      <span className="pointer-events-none absolute inset-y-0 left-2.5 grid place-items-center text-subtle"><Sun size={14} /></span>
      <span className="pointer-events-none absolute inset-y-0 right-2.5 grid place-items-center text-subtle"><Moon size={14} /></span>
      <span className={`relative grid h-7 w-7 place-items-center rounded-full bg-accent text-white shadow-md transition-transform duration-300 ease-[cubic-bezier(.3,1.4,.5,1)] dark:text-[#06121c] ${dark ? "translate-x-[32px]" : "translate-x-0"}`}>
        <Sun size={14} className={`absolute transition-all duration-300 ${dark ? "rotate-90 scale-0 opacity-0" : "rotate-0 scale-100 opacity-100"}`} />
        <Moon size={14} className={`absolute transition-all duration-300 ${dark ? "rotate-0 scale-100 opacity-100" : "-rotate-90 scale-0 opacity-0"}`} />
      </span>
    </button>
  );
}

const LANGS: { code: Lang; short: string; name: string }[] = [
  { code: "en", short: "EN", name: "English" },
  { code: "ru", short: "RU", name: "Русский" },
];

/** Segmented EN | RU control with a sliding thumb; arrow keys move between options (radiogroup pattern). */
export function LangSwitch() {
  const { lang, setLang, t } = useI18n();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const idx = LANGS.findIndex((l) => l.code === lang);
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft" && e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
    e.preventDefault();
    const next = (idx + (e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : LANGS.length - 1)) % LANGS.length;
    setLang(LANGS[next].code);
    refs.current[next]?.focus();
  };
  return (
    <div role="radiogroup" aria-label={t("top.lang.label")} onKeyDown={onKey} className="relative inline-grid h-9 shrink-0 grid-cols-2 rounded-full border border-line bg-raised p-1">
      <span aria-hidden="true" className="absolute inset-y-1 left-1 w-[calc(50%-4px)] rounded-full bg-surface shadow-md ring-1 ring-line transition-transform duration-300 ease-[cubic-bezier(.3,1.2,.5,1)]" style={{ transform: `translateX(${idx * 100}%)` }} />
      {LANGS.map((l, i) => (
        <button key={l.code} ref={(el) => { refs.current[i] = el; }} type="button" role="radio" aria-checked={lang === l.code} tabIndex={lang === l.code ? 0 : -1}
          title={l.name} aria-label={l.name} onClick={() => setLang(l.code)}
          className={`relative z-10 min-w-[38px] rounded-full px-2.5 font-mono text-[11px] font-semibold tracking-wider transition-colors ${lang === l.code ? "text-accent" : "text-subtle hover:text-fg"}`}>
          {l.short}
        </button>
      ))}
    </div>
  );
}
