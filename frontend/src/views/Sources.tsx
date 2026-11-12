import { BookOpen, Info } from "lucide-react";
import { useGet, PageSkeleton, ErrorBox, Page, Chip } from "../components/ui";
import { LinkKindBadge } from "../components/research/SourceLink";
import { useI18n } from "../i18n";
import type { Source } from "../api";

type Ov = { source_usage: { id: string; findings: number }[]; dataset_version: string; record_status: string };

export default function Sources() {
  const { t } = useI18n();
  const s = useGet<Source[]>("/sources");
  const ov = useGet<Ov>("/overview");
  const use = Object.fromEntries((ov.data?.source_usage ?? []).map((u) => [u.id, u.findings]));
  const kinds = (s.data ?? []).reduce<Record<string, number>>((m, x) => ({ ...m, [x.link_kind]: (m[x.link_kind] ?? 0) + 1 }), {});
  return (
    <Page eyebrow={t("so.eyebrow")} title={t("so.title")} sub={t("so.sub")}>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="flex gap-3 rounded-card border border-warn/30 bg-warn/[.06] p-4 text-[13px] lg:col-span-2" role="note">
          <Info size={18} className="mt-0.5 shrink-0 text-warn" aria-hidden="true" />
          <div className="space-y-2 leading-relaxed text-muted">
            <p><b className="font-semibold text-fg">{t("so.bannerTitle")}.</b> {t("so.banner")}</p>
            <p>{t("so.provenance")}</p>
          </div>
        </div>
        <dl className="panel grid grid-cols-3 divide-x divide-line p-0">
          {(["direct", "search", "portal"] as const).map((k) => (
            <div key={k} className="p-4"><dt className="text-[11.5px] text-subtle">{t(`src.kind.${k}`)}</dt><dd className="mt-1.5 text-[26px] font-light leading-none text-fg tabular-nums">{kinds[k] ?? 0}</dd></div>
          ))}
        </dl>
      </div>
      {s.error ? <ErrorBox error={s.error} retry={s.retry} /> : !s.data ? <PageSkeleton /> : (
        <div className="panel overflow-hidden">
          <ul className="stagger divide-y divide-line">
            {s.data.map((x) => (
              <li key={x.id} className="grid gap-x-6 gap-y-2 p-4 sm:p-5 md:grid-cols-[1fr_auto]">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 font-mono text-[10.5px] text-subtle"><span>{x.id}</span><span aria-hidden="true">·</span><span>{x.publisher}</span><span aria-hidden="true">·</span><span>{x.type}</span></p>
                  <h2 className="mt-1.5 text-[14.5px] font-semibold leading-snug text-fg">{x.title}</h2>
                  <p className="mt-1 text-[12.5px] leading-relaxed text-muted">{x.note}</p>
                  <a href={x.url} target="_blank" rel="noreferrer" className="mt-2 block break-all font-mono text-[11px] text-accent hover:underline">{x.url}</a>
                </div>
                <div className="flex flex-wrap items-start gap-1.5 md:flex-col md:items-end">
                  <LinkKindBadge kind={x.link_kind} />
                  {ov.data && <Chip tone={use[x.id] ? "accent" : "warn"}><BookOpen size={11} />{t("so.findings", { n: use[x.id] ?? 0 })}</Chip>}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Page>
  );
}
