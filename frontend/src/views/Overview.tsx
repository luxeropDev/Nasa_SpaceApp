import { ArrowRight, Rocket, Sparkles } from "lucide-react";
import { useGet, PageSkeleton, ErrorBox, Panel, Chip } from "../components/ui";
import { Meter, Stat } from "../components/charts";
import { useI18n } from "../i18n";
import { href } from "../nav";
import { SAFETY_DOMAINS, SCENARIOS } from "../api";
import Matrix from "./OverviewMatrix";
import type { Cell as MatrixCell } from "./OverviewMatrix";
import OverviewCharts from "./OverviewCharts";
import OverviewLower from "./OverviewLower";

type Ov = {
  dataset_version: string; record_status: string;
  kpis: { investigations: number; research_domains: number; source_documents: number; evidence_insights: number };
  by_domain: { name: string; count: number }[]; by_fuel: { key: string; count: number }[]; by_safety_domain: { key: string; count: number }[];
  mission_relevance: { key: string; name: string; count: number }[]; coverage_matrix: MatrixCell[];
  source_usage: { id: string; title: string; findings: number }[]; knowledge_gaps: { title: string; detail: string }[];
};

export default function Overview() {
  const { t, tc } = useI18n();
  const ov = useGet<Ov>("/overview");
  if (ov.error) return <ErrorBox error={ov.error} retry={ov.retry} />;
  if (!ov.data) return <PageSkeleton />;
  const d = ov.data;
  const total = d.kpis.investigations;
  const maxRel = Math.max(1, ...d.mission_relevance.map((m) => m.count));
  const maxSd = Math.max(1, ...d.by_safety_domain.map((m) => m.count));
  const kpis: [string, number][] = [[t("ov.kpi.inv"), d.kpis.investigations], [t("ov.kpi.dom"), d.kpis.research_domains], [t("ov.kpi.src"), d.kpis.source_documents], [t("ov.kpi.ins"), d.kpis.evidence_insights]];

  return (
    <div className="space-y-5">
      <section className="panel fade relative overflow-hidden p-6 sm:p-8">
        <div aria-hidden="true" className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-accent/10 blur-3xl" />
        <div className="relative max-w-3xl">
          <Chip tone="accent"><Sparkles size={12} />{t("ov.eyebrow")}</Chip>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight text-fg sm:text-4xl">{t("ov.title")}</h1>
          <p className="mt-2 text-lg text-muted">{t("ov.subtitle")}</p>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-subtle">{t("ov.lead")}</p>
          <div className="mt-5 flex flex-wrap gap-2.5">
            <a className="btn btn-primary" href={href("assistant")}>{t("ov.cta.ask")}<ArrowRight size={15} /></a>
            <a className="btn" href={href("explorer")}>{t("ov.cta.explore")}</a>
            <a className="btn" href={href("intel")}>{t("ov.cta.intel")}</a>
          </div>
        </div>
      </section>

      <div className="stagger grid grid-cols-2 gap-3 lg:grid-cols-4">{kpis.map(([l, v]) => <Stat key={l} label={l} value={v} />)}</div>
      <p className="label -mt-2 !normal-case !tracking-normal">{t("ov.kpiNote", { version: d.dataset_version })}</p>

      <OverviewCharts byDomain={d.by_domain} byFuel={d.by_fuel} total={total} />

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title={t("ov.rel.title")} sub={t("ov.rel.sub")}>
          <div className="space-y-4">{d.mission_relevance.map((m) => <Meter key={m.key} value={m.count} max={maxRel} label={m.name} count={`${m.count}/${total}`} />)}</div>
        </Panel>
        <Panel title={t("ov.sd.title")} sub={t("ov.sd.sub")}>
          <div className="space-y-4">{d.by_safety_domain.map((m) => <Meter key={m.key} value={m.count} max={maxSd} label={tc("sd", m.key)} count={m.count} tone={m.count < 3 ? "warn" : "accent"} />)}</div>
        </Panel>
      </div>

      <Panel title={t("ov.matrix.title")} sub={t("ov.matrix.sub")}>
        <Matrix cells={d.coverage_matrix} scenarios={SCENARIOS} domains={SAFETY_DOMAINS} />
      </Panel>

      <OverviewLower gaps={d.knowledge_gaps} usage={d.source_usage} />
      <p className="label flex items-start gap-1.5 !normal-case !tracking-normal"><Rocket size={12} className="mt-0.5 shrink-0" /><span>{t("ov.sys")} {d.record_status}</span></p>
    </div>
  );
}
