import { useId } from "react";

/** FLAMEWISE app mark: a spherical flame (as flames burn in microgravity) inside an instrument ring. */
export function LogoMark({ size = 28, className = "" }: { size?: number; className?: string }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className={className} aria-hidden="true">
      <defs>
        <radialGradient id={`lg${id}`} cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="#FFF4E8" />
          <stop offset=".42" stopColor="#FF9B45" />
          <stop offset=".72" stopColor="#36BFFA" stopOpacity=".85" />
          <stop offset="1" stopColor="#36BFFA" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="16" cy="16" r="11" fill={`url(#lg${id})`} />
      <circle cx="16" cy="16" r="14.25" fill="none" stroke="currentColor" strokeOpacity=".35" strokeWidth="1" strokeDasharray="2 2.6" />
      <circle cx="16" cy="16" r="2.6" fill="#fff" />
    </svg>
  );
}

export function Wordmark({ collapsed = false, sub }: { collapsed?: boolean; sub?: string }) {
  return (
    <span className="flex min-w-0 items-center gap-2.5">
      <LogoMark size={30} className="shrink-0 text-accent" />
      {!collapsed && (
        <span className="min-w-0 leading-tight">
          <span className="block text-[13.5px] font-bold tracking-[.2em] text-fg">FLAMEWISE</span>
          {sub && <span className="block truncate font-mono text-[9.5px] uppercase tracking-[.16em] text-subtle">{sub}</span>}
        </span>
      )}
    </span>
  );
}
