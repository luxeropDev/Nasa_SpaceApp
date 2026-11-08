import { ArrowLeft, ArrowRight, GitCompareArrows } from "lucide-react";
import { Chip, Ext, Panel } from "../components/ui";
import { useI18n } from "../i18n";
import { href } from "../nav";
import type { Inv, Source } from "../api";

type P = { inv: Inv; all: Inv[]; srcs: Record<string, Source> };

export default function Detail({ inv, all, srcs }: P) {
  const { t, tc } = useI18n();
  const unknown = <span className="italic text-subtle">{t("common.unknown")} · {t("common.notStored")}</span>;
  const rows: [string, React.ReactNode][] = [
    [t("det.fuel"), tc("fuel", inv.fuel_type)], [t("det.material"), inv.fuel_material], [t("det.hardware"), inv.hardware], [t("det.gravity"), inv.gravity_environment],
    [t("det.o2"), inv.oxygen_concentration ?? unknown], [t("det.air"), inv.airflow_speed ?? unknown],
    [t("det.domain"), inv.research_domain], [t("det.fsd"), tc("sd", inv.fire_safety_domain)],
  ];
  const idx = all.findIndex((a) => a.id === inv.id);
  const prev = idx > 0 ? all[idx - 1] : null;
  const next = idx < all.length - 1 ? all[idx + 1] : null;
  const related = inv.related.filter((r) => all.some((a) => a.id === r));
  const cmpIds = [inv.id, related[0]].filter(Boolean).join(",");
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <a className="btn" href={href("explorer")}><ArrowLeft size={14} />{t("det.back")}</a>
        <div className="flex gap-2">
          {prev && <a className="btn" href={href("explorer", prev.id)} aria-label={`${t("det.prev")}: ${prev.acronym}`}><ArrowLeft size={14} />{prev.acronym}</a>}
          {next && <a className="btn" href={href("explorer", next.id)} aria-label={`${t("det.next")}: ${next.acronym}`}>{next.acronym}<ArrowRight size={14} /></a>}
        </div>
      </div>
      <section className="panel p-6">
        <div className="flex flex-wrap items-center gap-2"><Chip tone="accent">{inv.acronym}</Chip><Chip>{inv.id}</Chip><Chip tone="warn">{t("rec.curated_starter")}</Chip></div>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight text-fg">{inv.full_name}</h1>
        <p className="label mt-4">{t("det.objective")}</p>
        <p className="mt-1 max-w-3xl text-sm leading-relaxed text-muted">{inv.objective}</p>
        {related.length > 0 && <a className="btn mt-4" href={href("compare", null, { ids: cmpIds })}><GitCompareArrows size={14} />{t("det.compare")}</a>}
      </section>
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title={t("det.conditions")}>
          <dl className="divide-y divide-line text-sm">{rows.map(([k, v]) => <div key={k} className="grid grid-cols-[9rem_1fr] gap-3 py-2"><dt className="text-subtle">{k}</dt><dd className="min-w-0 break-words text-fg">{v}</dd></div>)}</dl>
          {inv.known_conditions.length > 0 && <ul className="mt-3 list-disc space-y-1 pl-4 text-xs text-muted">{inv.known_conditions.map((c) => <li key={c}>{c}</li>)}</ul>}
          <p className="label mt-4 !normal-case !tracking-normal">{t("det.numeric")}: {inv.numeric_data_status}</p>
        </Panel>
        <Panel title={t("det.measure")}>
          <div className="flex flex-wrap gap-1.5">{inv.measurement_types.map((m) => <Chip key={m} tone="accent">{m}</Chip>)}</div>
          <p className="label mb-2 mt-5">{t("det.relevance")}</p>
          <div className="flex flex-wrap gap-1.5">{inv.relevance.map((r) => <Chip key={r}>{tc("scen", r)}</Chip>)}</div>
          {inv.relevance_note && <p className="mt-3 text-xs leading-relaxed text-muted">{inv.relevance_note}</p>}
        </Panel>
        <Panel title={t("det.findings")} sub={t("det.findingsSub")}>
          <ul className="space-y-3">{inv.findings.map((f) => <li key={f.text} className="text-sm"><p className="leading-relaxed text-fg">{f.text}</p><div className="mt-1 text-xs"><Ext href={srcs[f.source_id]?.url ?? "#"}>{srcs[f.source_id]?.title}</Ext></div></li>)}</ul>
        </Panel>
        <Panel title={t("det.limits")}>
          <ul className="list-disc space-y-2 pl-4 text-sm leading-relaxed text-muted marker:text-warn">{inv.limitations.map((l) => <li key={l}>{l}</li>)}</ul>
        </Panel>
        <Panel title={t("det.related")}>
          <div className="flex flex-wrap gap-2">{related.map((r) => { const x = all.find((a) => a.id === r)!; return <a key={r} className="btn" href={href("explorer", r)}>{x.acronym}</a>; })}</div>
        </Panel>
        <Panel title={t("det.sources")}>
          <ul className="space-y-1.5 text-sm">{inv.source_ids.map((s) => <li key={s}><Ext href={srcs[s]?.url ?? "#"}>{srcs[s]?.title}</Ext></li>)}</ul>
        </Panel>
      </div>
    </div>
  );
}
