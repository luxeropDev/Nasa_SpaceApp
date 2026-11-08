import { Info } from "lucide-react";
import { useGet, PageSkeleton, ErrorBox, Page, Ext, Chip } from "../components/ui";
import { useI18n } from "../i18n";
import type { Source } from "../api";

type Ov = { source_usage: { id: string; findings: number }[] };

export default function Sources() {
  const { t } = useI18n();
  const s = useGet<Source[]>("/sources");
  const ov = useGet<Ov>("/overview");
  const use = Object.fromEntries((ov.data?.source_usage ?? []).map((u) => [u.id, u.findings]));
  return (
    <Page title={t("so.title")} sub={t("so.sub")}>
      <div className="panel flex gap-3 border-warn/30 bg-warn/5 p-4 text-sm" role="note">
        <Info size={18} className="mt-0.5 shrink-0 text-warn" aria-hidden="true" />
        <p className="leading-relaxed text-muted"><b className="font-semibold text-warn">{t("so.bannerTitle")}.</b> {t("so.banner")}</p>
      </div>
      {s.error ? <ErrorBox error={s.error} retry={s.retry} /> : !s.data ? <PageSkeleton /> : (
        <div className="stagger grid gap-3 md:grid-cols-2">
          {s.data.map((x) => (
            <article key={x.id} className="panel panel-hover p-5">
              <div className="flex items-start justify-between gap-3"><span className="label">{x.id}</span><Chip>{x.type}</Chip></div>
              <h2 className="mt-2.5 text-sm font-semibold leading-snug text-fg">{x.title}</h2>
              <p className="mt-1.5 text-xs leading-relaxed text-muted">{x.note}</p>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs">
                <Ext href={x.url}>{t("so.open")}</Ext>
                {ov.data && <Chip tone={use[x.id] ? "accent" : "warn"}>{t("so.findings", { n: use[x.id] ?? 0 })}</Chip>}
              </div>
              <div className="mt-2 break-all font-mono text-[10.5px] text-subtle">{x.url}</div>
            </article>
          ))}
        </div>
      )}
    </Page>
  );
}
