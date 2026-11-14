import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Panel } from "../components/ui";
import { useTooltipStyle } from "../components/charts";
import { useI18n } from "../i18n";
import { useChartTheme } from "../theme";

type Props = { byDomain: { name: string; count: number }[]; byFuel: { key: string; count: number }[]; total: number };

/**
 * Two record-count distributions. Both plot the number of curated records (a count of catalog entries),
 * not any physical measurement; the x-axis is labelled accordingly.
 */
export default function OverviewCharts({ byDomain, byFuel, total }: Props) {
  const { t, tc } = useI18n();
  const ch = useChartTheme();
  const tip = useTooltipStyle();
  const fuel = byFuel.map((f) => ({ name: tc("fuel", f.key), count: f.count }));
  const axisLabel = { value: t("ov2.axis.records"), position: "insideBottom" as const, offset: -2, fill: ch.axis, fontSize: 11 };
  const chart = (data: { name: string; count: number }[], h: number, w: number) => (
    <div style={{ height: h }} role="img" aria-label={data.map((d) => `${d.name}: ${d.count}`).join("; ")}>
      <ResponsiveContainer>
        <BarChart data={data} layout="vertical" margin={{ left: 0, right: 16, bottom: 14 }}>
          <CartesianGrid stroke={ch.grid} horizontal={false} />
          <XAxis type="number" allowDecimals={false} stroke={ch.axis} fontSize={11} tickLine={false} label={axisLabel} />
          <YAxis type="category" dataKey="name" width={w} stroke={ch.axis} fontSize={11} tickLine={false} axisLine={false} />
          <Tooltip {...tip} formatter={(v) => [v, t("ov2.axis.records")]} />
          <Bar dataKey="count" fill={ch.series[0]} barSize={12} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
  return (
    <div className="grid gap-4 xl:grid-cols-5">
      <Panel className="xl:col-span-3" title={t("ov.dist.title")} sub={t("ov.dist.sub")}>{chart(byDomain, 260, 150)}</Panel>
      <Panel className="xl:col-span-2" title={t("ov.land.title")} sub={`${t("ov.land.sub")} · n = ${total}`}>{chart(fuel, 260, 90)}</Panel>
    </div>
  );
}
