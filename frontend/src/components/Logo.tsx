type Variant = "white" | "navy";

const source = (variant: Variant) => `/brand/pyrolens-logo-${variant}.png`;

/** The supplied PyroLens emblem, cropped non-destructively from the transparent horizontal artwork. */
export function LogoMark({ size = 32, className = "", variant = "navy" }: { size?: number; className?: string; variant?: Variant }) {
  return (
    <span className={`relative block shrink-0 overflow-hidden ${className}`} style={{ width: size, height: size }} aria-hidden="true">
      <img src={source(variant)} alt="" className="absolute inset-y-0 left-0 h-full w-auto max-w-none" draggable={false} />
    </span>
  );
}

/** Full supplied transparent wordmark. White is for the black site header; navy is for paper/light surfaces. */
export function Wordmark({ collapsed = false, variant = "white", className = "" }: { collapsed?: boolean; sub?: string; variant?: Variant; className?: string }) {
  if (collapsed) return <LogoMark size={38} variant={variant} className={className} />;
  return (
    <img
      src={source(variant)}
      alt="PyroLens"
      width={2172}
      height={724}
      className={`h-10 w-auto max-w-[178px] object-contain object-left sm:h-11 sm:max-w-[198px] ${className}`}
      draggable={false}
    />
  );
}
