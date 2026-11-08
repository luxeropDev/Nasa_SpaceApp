import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { en } from "./en";
import type { Key } from "./en";
import { ru } from "./ru";
import { setApiLang } from "../api";

export type Lang = "en" | "ru";
export type { Key };
const DICTS: Record<Lang, Record<Key, string>> = { en, ru };
const STORE = "flamewise.lang";

type Params = Record<string, string | number>;
type Ctx = { lang: Lang; setLang: (l: Lang) => void; t: (k: Key, p?: Params) => string; tc: (prefix: string, code: string) => string };
const I18n = createContext<Ctx | null>(null);

function initial(): Lang {
  try {
    const s = localStorage.getItem(STORE);
    if (s === "en" || s === "ru") return s;
  } catch { /* storage unavailable (private mode) — fall back to browser language */ }
  return navigator.language?.toLowerCase().startsWith("ru") ? "ru" : "en";
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(initial);
  setApiLang(lang); // keep API layer in sync before any child effect fires

  useEffect(() => { document.documentElement.lang = lang; }, [lang]);
  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try { localStorage.setItem(STORE, l); } catch { /* ignore */ }
  }, []);

  const value = useMemo<Ctx>(() => {
    const d = DICTS[lang];
    const t = (k: Key, p?: Params) => {
      let s = d[k] ?? en[k];
      if (p) for (const [pk, pv] of Object.entries(p)) s = s.split(`{${pk}}`).join(String(pv));
      return s;
    };
    // code -> label lookup for structural codes (e.g. tc("scen", "iss")); unknown codes render as-is
    const tc = (prefix: string, code: string) => (d as Record<string, string>)[`${prefix}.${code}`] ?? code;
    return { lang, setLang, t, tc };
  }, [lang, setLang]);

  return <I18n.Provider value={value}>{children}</I18n.Provider>;
}

export function useI18n(): Ctx {
  const c = useContext(I18n);
  if (!c) throw new Error("useI18n must be used inside <I18nProvider>");
  return c;
}
