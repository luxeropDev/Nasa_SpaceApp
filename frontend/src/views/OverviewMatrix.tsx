import { href } from "../nav";
import { useI18n } from "../i18n";

export type Cell = { scenario: string; domain: string; count: number };

/** Scenario x safety-domain coverage heatmap. Cell intensity is the real record count; empty cells are flagged as gaps. */
export default function Matrix({ cells, scenarios, domains }: { cells: Cell[]; scenarios: readonly string[]; domains: readonly string[] }) {
  const { t, tc } = useI18n();
  const max = Math.max(1, ...cells.map((c) => c.count));
  const get = (s: string, d: string) => cells.find((c) => c.scenario === s && c.domain === d)?.count ?? 0;
  return (
    <div className="-mx-1 overflow-x-auto px-1">
      <table className="w-full min-w-[480px] border-separate border-spacing-1.5 text-sm">
        <thead>
          <tr>
            <th className="w-28 sm:w-40" />
            {domains.map((d) => <th key={d} scope="col" className="px-1 pb-1 text-left align-bottom text-xs font-medium text-muted">{tc("sd", d)}</th>)}
          </tr>
        </thead>
        <tbody>
          {scenarios.map((s) => (
            <tr key={s}>
              <th scope="row" className="pr-2 text-left text-xs font-medium text-muted">{tc("scen", s)}</th>
              {domains.map((d) => {
                const n = get(s, d);
                const label = n === 0 ? t("ov.matrix.gap") : t("ov.matrix.records", { n });
                return (
                  <td key={d}>
                    <a href={href("intel", null, { scenario: s, domain: d })} title={`${tc("scen", s)} · ${tc("sd", d)}: ${label}`} aria-label={`${tc("scen", s)}, ${tc("sd", d)}: ${label}`}
                      className={`grid h-14 place-items-center rounded-xl border font-mono text-sm font-semibold transition hover:scale-[1.03] hover:shadow-card ${n === 0 ? "border-dashed border-warn/50 bg-warn/5 text-warn" : "border-accent/20 text-fg"}`}
                      style={n === 0 ? undefined : { background: `rgb(var(--accent) / ${(0.1 + (n / max) * 0.5).toFixed(2)})` }}>
                      {n === 0 ? "0" : n}
                    </a>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
