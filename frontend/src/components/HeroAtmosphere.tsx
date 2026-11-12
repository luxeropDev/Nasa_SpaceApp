import { useMemo } from "react";

/**
 * Original atmospheric hero background: a schematic spherical diffusion flame — the shape flames take in
 * microgravity, where there is no buoyant convection — with an instrument reticle and drifting particles.
 * Pure SVG/CSS (no video, no WebGL). It is labelled as an illustration so it is never mistaken for data.
 */
export default function HeroAtmosphere({ caption }: { caption: string }) {
  // deterministic pseudo-random particle field (stable between renders, no Math.random flicker)
  const dust = useMemo(() => {
    let s = 7;
    const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
    return Array.from({ length: 70 }, () => ({ x: rnd() * 1400, y: rnd() * 800, r: 0.4 + rnd() * 1.3, o: 0.15 + rnd() * 0.5 }));
  }, []);
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      <div className="hero-grid absolute inset-0" />
      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 1400 800" preserveAspectRatio="xMidYMid slice">
        <defs>
          <radialGradient id="hf-halo" cx="50%" cy="50%" r="50%">
            <stop offset="0" stopColor="#36BFFA" stopOpacity=".0" />
            <stop offset=".55" stopColor="#36BFFA" stopOpacity=".0" />
            <stop offset=".72" stopColor="#36BFFA" stopOpacity=".38" />
            <stop offset=".8" stopColor="#67E8F9" stopOpacity=".22" />
            <stop offset="1" stopColor="#36BFFA" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="hf-core" cx="50%" cy="50%" r="50%">
            <stop offset="0" stopColor="#FFF6EC" stopOpacity=".95" />
            <stop offset=".18" stopColor="#FFB872" stopOpacity=".55" />
            <stop offset=".46" stopColor="#FF9B45" stopOpacity=".12" />
            <stop offset="1" stopColor="#FF9B45" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="hf-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0" stopColor="#1E5A8C" stopOpacity=".55" />
            <stop offset="1" stopColor="#1E5A8C" stopOpacity="0" />
          </radialGradient>
        </defs>
        <circle cx="1010" cy="380" r="520" fill="url(#hf-glow)" />
        <g className="hero-flame">
          <circle cx="1010" cy="380" r="250" fill="url(#hf-halo)" />
          <circle cx="1010" cy="380" r="150" fill="url(#hf-core)" />
          {/* soot shell, as observed around burning droplets */}
          <circle cx="1010" cy="380" r="118" fill="none" stroke="#FF9B45" strokeOpacity=".22" strokeWidth="1.2" strokeDasharray="1 5" />
          <circle cx="1010" cy="380" r="6" fill="#fff" />
        </g>
        {/* instrument reticle */}
        <g stroke="#A5B4C7" strokeOpacity=".28" fill="none">
          <circle cx="1010" cy="380" r="300" strokeDasharray="2 6" />
          <ellipse cx="1010" cy="380" rx="380" ry="120" strokeOpacity=".16" transform="rotate(-14 1010 380)" />
          <line x1="1010" y1="40" x2="1010" y2="120" /><line x1="1010" y1="640" x2="1010" y2="720" />
          <line x1="650" y1="380" x2="730" y2="380" /><line x1="1290" y1="380" x2="1370" y2="380" />
        </g>
        <g className="hero-dust" fill="#E2E8F0">
          {dust.map((d, i) => <circle key={i} cx={d.x} cy={d.y} r={d.r} opacity={d.o} />)}
        </g>
      </svg>
      <div className="hero-vignette absolute inset-0" />
      <p className="absolute bottom-4 right-5 hidden font-mono text-[10px] uppercase tracking-[.18em] text-white/40 md:block">{caption}</p>
    </div>
  );
}
