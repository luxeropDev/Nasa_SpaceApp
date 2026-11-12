import { Suspense, lazy, useEffect, useRef, useState } from "react";
import { ExternalLink } from "lucide-react";
import type { Health } from "./api";
import { useGet, Chip, PageSkeleton } from "./components/ui";
import { Dialog } from "./components/Dialog";
import AppShell from "./components/layout/AppShell";
import { useI18n } from "./i18n";
import type { Key } from "./i18n";
import { href, useRoute } from "./nav";

// route-level code splitting: recharts and the graph only load on the pages that use them
const Overview = lazy(() => import("./views/Overview"));
const Explorer = lazy(() => import("./views/Explorer"));
const Assistant = lazy(() => import("./views/Assistant"));
const Comparator = lazy(() => import("./views/Comparator"));
const Intelligence = lazy(() => import("./views/Intelligence"));
const EvidenceGraph = lazy(() => import("./views/EvidenceGraph"));
const Scenarios = lazy(() => import("./views/Scenarios"));
const Reports = lazy(() => import("./views/Reports"));
const Sources = lazy(() => import("./views/Sources"));

function Fallback() {
  return <div className="mx-auto max-w-[1440px] px-4 pt-9 sm:px-6 lg:px-8"><PageSkeleton /></div>;
}

export default function App() {
  const { t } = useI18n();
  const route = useRoute();
  const [about, setAbout] = useState(false);
  const health = useGet<Health>("/health");
  const first = useRef(true);

  // move focus to <main> after navigation so screen-reader users land on the new content
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    document.getElementById("main")?.focus({ preventScroll: true });
  }, [route.view, route.id]);
  useEffect(() => { document.title = `${t(`nav.${route.view}` as Key)} · FLAMEWISE`; }, [route.view, t]);

  const online = !!health.data;
  const live = health.data?.llm_live;

  return (
    <AppShell view={route.view} health={health} onAbout={() => setAbout(true)}>
      <div key={`${route.view}:${route.id ?? ""}`} className="page-in">
        <Suspense fallback={<Fallback />}>
          {route.view === "overview" && <Overview health={health.data} />}
          {route.view === "explorer" && <Explorer id={route.id} params={route.params} />}
          {route.view === "assistant" && <Assistant params={route.params} health={health} />}
          {route.view === "compare" && <Comparator params={route.params} />}
          {route.view === "intel" && <Intelligence params={route.params} />}
          {route.view === "graph" && <EvidenceGraph params={route.params} />}
          {route.view === "scenarios" && <Scenarios params={route.params} />}
          {route.view === "reports" && <Reports params={route.params} />}
          {route.view === "sources" && <Sources />}
        </Suspense>
      </div>

      <Dialog open={about} onClose={() => setAbout(false)} title={t("about.title")} description={t("about.desc")} wide>
        <dl className="divide-y divide-line text-[13px]">
          <div className="flex justify-between gap-4 py-2.5"><dt className="text-subtle">{t("status.api")}</dt><dd><Chip tone={online ? "ok" : health.error ? "danger" : "neutral"}>{online ? t("top.online") : health.error ? t("top.offline") : t("top.checking")}</Chip></dd></div>
          <div className="flex justify-between gap-4 py-2.5"><dt className="text-subtle">{t("status.dataset")}</dt><dd className="font-mono text-fg">{health.data?.dataset_version ?? "—"}</dd></div>
          <div className="flex justify-between gap-4 py-2.5"><dt className="text-subtle">{t("status.mode")}</dt><dd><Chip tone={!online ? "danger" : live ? "ok" : "warn"}>{!online ? t("status.offline") : live ? t("mode.live") : t("mode.demo")}</Chip></dd></div>
          <div className="flex justify-between gap-4 py-2.5"><dt className="text-subtle">{t("status.llm")}</dt><dd className="text-right text-fg">{health.data?.llm_provider ?? t("status.llmNone")}</dd></div>
        </dl>
        <p className="mt-3 text-xs leading-relaxed text-muted">{!online ? t("status.offlineNote") : live ? t("status.liveNote") : t("status.demoNote")}</p>
        <div className="mt-5 space-y-2 rounded-card border border-line bg-raised p-4 text-[12.5px] leading-relaxed text-muted">
          <p className="font-semibold text-fg">{t("about.whatTitle")}</p>
          <p>{t("about.what")}</p>
          <p>{t("about.independent")}</p>
          <p className="flex flex-wrap gap-x-4 gap-y-1 pt-1">
            <a className="inline-flex items-center gap-1 text-accent hover:underline" href={href("sources")} onClick={() => setAbout(false)}>{t("about.sources")}</a>
            <a className="inline-flex items-center gap-1 text-accent hover:underline" href="/docs" target="_blank" rel="noreferrer">{t("about.apiDocs")}<ExternalLink size={11} /></a>
          </p>
          <p className="pt-1 font-mono text-[11px] text-subtle">{t("about.shortcuts")}</p>
        </div>
      </Dialog>
    </AppShell>
  );
}
