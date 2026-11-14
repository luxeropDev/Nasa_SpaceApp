/**
 * FLAMEWISE mark: a flat instrument frame with a measurement reticle around a spherical flame front — the
 * shape a diffusion flame takes in microgravity, where buoyant convection is absent. No gradients, no glow.
 */
export function LogoMark({ size = 28, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className={className} aria-hidden="true" fill="none">
      <rect x="1.5" y="1.5" width="29" height="29" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M16 1.5v4M16 26.5v4M1.5 16h4M26.5 16h4" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="16" cy="16" r="7.25" stroke="rgb(var(--brand))" strokeWidth="1.5" />
      <circle cx="16" cy="16" r="3" fill="rgb(var(--brand))" />
    </svg>
  );
}

export function Wordmark({ collapsed = false, sub }: { collapsed?: boolean; sub?: string }) {
  return (
    <span className="flex min-w-0 items-center gap-2.5">
      <LogoMark size={26} className="shrink-0 text-navy" />
      {!collapsed && (
        <span className="min-w-0 leading-tight">
          <span className="block font-display text-[15px] font-semibold tracking-[.06em] text-fg">FLAMEWISE</span>
          {sub && <span className="block truncate font-mono text-[9.5px] uppercase tracking-[.08em] text-subtle">{sub}</span>}
        </span>
      )}
    </span>
  );
}
