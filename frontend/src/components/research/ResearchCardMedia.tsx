import type { Inv } from "../../api";
import { useI18n } from "../../i18n";
import type { Key } from "../../i18n";

type ImageSpec = { src: string; alt: Key; position: string };

const RESEARCH_IMAGES: Partial<Record<string, ImageSpec>> = {
  SAME_001: { src: "/research/same-aerosol-chamber.png", alt: "research.image.same.alt", position: "52% 58%" },
  BASS_001: { src: "/research/bass-polymer-strip.png", alt: "research.image.bass.alt", position: "50% 48%" },
  SAFFIRE_001: { src: "/research/saffire-fabric-specimen.png", alt: "research.image.saffire.alt", position: "42% 55%" },
  FLEX_001: { src: "/research/flex-blue-flame-droplet.png", alt: "research.image.flex.alt", position: "50% 50%" },
};

/** Shared media treatment for catalog and homepage cards. Unmapped records retain a neutral placeholder. */
export default function ResearchCardMedia({ inv, aspect = "aspect-[16/9]" }: { inv: Inv; aspect?: string }) {
  const { t } = useI18n();
  const image = RESEARCH_IMAGES[inv.id];
  return (
    <figure className={`relative overflow-hidden bg-[#111820] text-white ${aspect}`}>
      {image ? (
        <>
          <img src={image.src} alt={t(image.alt)} className="h-full w-full object-cover" style={{ objectPosition: image.position }} loading="lazy" decoding="async" />
          <span aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent" />
          <figcaption className="absolute right-2 top-2 max-w-[72%] bg-black/65 px-2 py-1 text-right text-[9px] leading-tight text-white/85">{t("research.image.disclosure")}</figcaption>
        </>
      ) : (
        <>
          <span aria-hidden="true" className="absolute inset-0 opacity-25 [background-image:linear-gradient(135deg,transparent_45%,#75a7ff_45%,#75a7ff_46%,transparent_46%),linear-gradient(0deg,transparent_70%,#fff_70%,#fff_70.5%,transparent_70.5%)]" />
          <span className="absolute left-5 top-5 font-mono text-[10px] uppercase tracking-[.14em] text-white/60">{inv.research_domain}</span>
        </>
      )}
      <strong className="absolute bottom-4 left-5 z-10 font-display text-[38px] font-bold tracking-[-.04em] text-white drop-shadow-sm">{inv.acronym}</strong>
    </figure>
  );
}
