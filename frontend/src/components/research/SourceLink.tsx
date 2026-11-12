import { ExternalLink, Globe, Search } from "lucide-react";
import type { LinkKind } from "../../api";
import { useI18n } from "../../i18n";

/** Badge saying honestly what a source URL resolves to (catalog search vs. portal vs. specific document). */
export function LinkKindBadge({ kind }: { kind: LinkKind }) {
  const { t } = useI18n();
  const I = kind === "search" ? Search : kind === "portal" ? Globe : ExternalLink;
  const tone = kind === "direct" ? "chip-ok" : kind === "search" ? "chip-warn" : "";
  return <span className={`chip ${tone} !text-[10.5px]`} title={t(`src.kind.${kind}.hint`)}><I size={10} aria-hidden="true" />{t(`src.kind.${kind}`)}</span>;
}

/** A source title linking out, with its link-kind badge. */
export function SourceLink({ title, url, kind, compact = false }: { title: string; url: string; kind?: LinkKind; compact?: boolean }) {
  const { t } = useI18n();
  return (
    <span className={`flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 ${compact ? "text-xs" : "text-[13px]"}`}>
      <a href={url} target="_blank" rel="noreferrer" title={t("common.external")} className="inline-flex min-w-0 items-center gap-1 text-accent underline-offset-2 hover:underline">
        <span className="min-w-0 break-words">{title}</span><ExternalLink size={11} className="shrink-0" aria-hidden="true" />
      </a>
      {kind && <LinkKindBadge kind={kind} />}
    </span>
  );
}
