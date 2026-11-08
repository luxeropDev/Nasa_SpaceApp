import { useEffect, useRef, useState } from "react";
import { useGet, Chip } from "./components/ui";
import { Dialog } from "./components/Dialog";
import TopBar from "./components/TopBar";
import type { Health } from "./components/TopBar";
import { useI18n } from "./i18n";
import type { Key } from "./i18n";
import { useRoute } from "./nav";
import Overview from "./views/Overview";
import Explorer from "./views/Explorer";
import Assistant from "./views/Assistant";
import Comparator from "./views/Comparator";
import Intelligence from "./views/Intelligence";
import Sources from "./views/Sources";

export default function App() {
  const { t } = useI18n();
  const route = useRoute();
  const [status, setStatus] = useState(false);
  const health = useGet<Health>("/health");
  const first = useRef(true);

  // move focus to <main> after navigation so screen-reader users land on the new content
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    document.getElementById("main")?.focus({ preventScroll: true });
  }, [route.view, route.id]);
  useEffect(() => { document.title = `${t(`nav.${route.view}.full` as Key)} \u00b7 FLAMEWISE`; }, [route.view, t]);

  const online = !!health.data;
  const live = health.data?.llm_live;
  const sysLabel = online ? t("top.online") : health.error ? t("top.offline") : t("top.checking");

  return (
    <div className="min-h-screen">
      <a href="#main" onClick={(e) => { e.preventDefault(); document.getElementById("main")?.focus(); }} className="sr-only left-4 top-3 z-[80] rounded-lg bg-accent px-3 py-2 text-sm text-white focus:not-sr-only focus:fixed">{t("nav.skip")}</a>
      <TopBar view={route.view} health={health} onStatus={() => setStatus(true)} />
      <main id="main" tabIndex={-1} className="mx-auto w-full max-w-[1400px] px-4 py-6 outline-none md:px-6 md:py-8">
        <div key={`${route.view}:${route.id ?? ""}`} className="page-in">
          {route.view === "overview" && <Overview />}
          {route.view === "explorer" && <Explorer id={route.id} />}
          {route.view === "assistant" && <Assistant params={route.params} />}
          {route.view === "compare" && <Comparator params={route.params} />}
          {route.view === "intel" && <Intelligence params={route.params} />}
          {route.view === "sources" && <Sources />}
        </div>
      </main>
      <footer className="mx-auto max-w-[1400px] px-4 pb-8 text-center md:px-6"><p className="label !normal-case !tracking-normal">{t("footer.text")}</p></footer>

      <Dialog open={status} onClose={() => setStatus(false)} title={t("status.title")} description={t("status.desc")}>
        <dl className="divide-y divide-line text-sm">
          <div className="flex justify-between gap-4 py-2.5"><dt className="text-subtle">{t("status.api")}</dt><dd><Chip tone={online ? "ok" : "warn"}>{sysLabel}</Chip></dd></div>
          <div className="flex justify-between gap-4 py-2.5"><dt className="text-subtle">{t("status.dataset")}</dt><dd className="font-mono text-fg">{health.data?.dataset_version ?? "\u2014"}</dd></div>
          <div className="flex justify-between gap-4 py-2.5"><dt className="text-subtle">{t("status.mode")}</dt><dd><Chip tone={live ? "ok" : "warn"}>{live ? t("mode.live") : t("mode.demo")}</Chip></dd></div>
          <div className="flex justify-between gap-4 py-2.5"><dt className="text-subtle">{t("status.llm")}</dt><dd className="text-fg">{health.data?.llm_provider ?? t("status.llmNone")}</dd></div>
        </dl>
        <p className="mt-3 text-xs leading-relaxed text-muted">{!online ? t("status.offlineNote") : live ? t("status.liveNote") : t("status.demoNote")}</p>
      </Dialog>
    </div>
  );
}
