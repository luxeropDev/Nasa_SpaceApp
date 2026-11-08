import { AlertTriangle } from "lucide-react";
import { useGet, ErrorBox, Panel, Ext } from "../components/ui";
import { Meter } from "../components/charts";
import { useI18n } from "../i18n";
import { href } from "../nav";

type Ins = { investigation_id: string; acronym: string; text: string; source_title: string; source_url: string }[];
type Props = { gaps: { title: string; detail: string }[]; usage: { id: string; title: string; findings: number }[] };

export default function OverviewLower({ gaps, usage }: Props) {
  const { t } = useI18n();
  const ins = useGet<Ins>("/insights");
  const maxUse = Math.max(1, ...usage.map((x) => x.findings));
  const flow = [
    { k: "ov.flow.1" as const, to: href("assistant", null, { q: t("as.s1") }) },
    { k: "ov.flow.2" as const, to: href("compare", null, { ids: "BASS_001,SAFFIRE_001" }) },
    { k: "ov.flow.3" as const, to: href("intel", null, { scenario: "lunar_habitat", domain: "smoke_detection" }) },
  ];
  return (
    <>
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title={t("ov.gaps.title")} sub={t("ov.gaps.sub")}>
          <ul className="space-y-3">{gaps.map((g) => (
            <li key={g.title} className="flex gap-3"><span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-warn/10 text-warn"><AlertTriangle size={14} /></span><div><div className="text-sm font-medium text-fg">{g.title}</div><div className="text-xs leading-relaxed text-muted">{g.detail}</div></div></li>
          ))}</ul>
        </Panel>
        <Panel title={t("ov.use.title")} sub={t("ov.use.sub")}>
          <div className="space-y-3.5">{usage.map((s) => <Meter key={s.id} value={s.findings} max={maxUse} label={s.title} count={s.findings} tone={s.findings === 0 ? "warn" : "accent"} />)}</div>
        </Panel>
      </div>

      <Panel title={t("ov.ins.title")} sub={t("ov.ins.sub")}>
        {ins.error ? <ErrorBox error={ins.error} retry={ins.retry} /> : !ins.data ? <div className="skeleton h-28" /> : (
          <div className="stagger grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {ins.data.map((i) => (
              <article key={i.investigation_id} className="panel-hover rounded-xl border border-line bg-raised/40 p-4">
                <a href={href("explorer", i.investigation_id)} className="chip chip-accent hover:bg-accent/20">{i.acronym}</a>
                <p className="mt-2.5 text-sm leading-relaxed text-fg">{i.text}</p>
                <div className="mt-2.5 text-xs"><Ext href={i.source_url}>{i.source_title}</Ext></div>
              </article>
            ))}
          </div>
        )}
      </Panel>

      <Panel title={t("ov.flow.title")}>
        <ol className="grid gap-3 md:grid-cols-3">
          {flow.map((f, i) => (
            <li key={f.k}><a href={f.to} className="panel-hover flex h-full items-start gap-3 rounded-xl border border-line bg-raised/40 p-4 text-sm text-fg">
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-accent/10 font-mono text-xs text-accent">{i + 1}</span>{t(f.k)}</a></li>
          ))}
        </ol>
      </Panel>
    </>
  );
}
