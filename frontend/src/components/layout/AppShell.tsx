import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import type { Health } from "../../api";
import { useI18n } from "../../i18n";
import type { View } from "../../nav";
import CommandSearch from "./CommandSearch";
import TopNav from "./TopNav";
import { Wordmark } from "../Logo";

type Props = { view: View; health: { data: Health | null; error: unknown }; onAbout: () => void; children: ReactNode };

/** Application frame: sticky horizontal top navigation, full-width content, footer, global search palette. */
export default function AppShell({ view, health, onAbout, children }: Props) {
  const { t } = useI18n();
  const [search, setSearch] = useState(false);

  // global shortcut: Ctrl/⌘+K, or "/" when not typing, opens search
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(el?.tagName ?? "") || !!el?.isContentEditable;
      if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) { e.preventDefault(); setSearch(true); }
      else if (e.key === "/" && !typing) { e.preventDefault(); setSearch(true); }
    };
    document.addEventListener("keydown", on);
    return () => document.removeEventListener("keydown", on);
  }, []);

  return (
    <div className="flex min-h-screen flex-col">
      <a href="#main" onClick={(e) => { e.preventDefault(); document.getElementById("main")?.focus(); }} className="sr-only left-4 top-3 z-[80] rounded-ctl bg-accent px-3 py-2 text-sm text-white focus:not-sr-only focus:fixed">{t("nav.skip")}</a>
      <TopNav view={view} health={health} onAbout={onAbout} onSearch={() => setSearch(true)} />
      <main id="main" tabIndex={-1} className="flex-1 outline-none">{children}</main>
      <footer className="zone-dark no-print bg-black">
        <div className="mx-auto grid max-w-[1600px] gap-8 px-4 py-10 sm:px-6 md:grid-cols-[240px_1fr] md:py-14 lg:px-10">
          <Wordmark variant="white" className="w-[190px]" />
          <div className="border-t border-line pt-5 md:border-l md:border-t-0 md:pl-8 md:pt-0">
            <p className="max-w-4xl text-[12px] leading-relaxed text-muted">{t("footer.text")}</p>
            <p className="mt-4 font-mono text-[10px] uppercase tracking-[.12em] text-subtle">Independent scientific research interface</p>
          </div>
        </div>
      </footer>
      <CommandSearch open={search} onClose={() => setSearch(false)} />
    </div>
  );
}
