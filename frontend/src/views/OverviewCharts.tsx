import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Panel } from "../components/ui";
import { useTooltipStyle } from "../components/charts";
import { useI18n } from "../i18n";
import { useChartTheme } from "../theme";

type Props = { byDomain: { name: string; count: number }[]; byFuel: { key: string; count: number }[]; total: number };

export default function OverviewCharts({ byDomain, byFuel, total }: Props) {
  const { t, tc } = useI18n();
  const ch = useChartTheme();
  const tip = useTooltipStyle();
  const fuel = byFuel.map((f) => ({ name: tc("fuel", f.key), count: f.count }));
  const color = (i: number) => ch.series[i % ch.series.length];
  return (
    <div className="grid gap-4 lg:grid-cols-5">
      <Panel className="lg:col-span-3" title={t("ov.dist.title")} sub={t("ov.dist.sub")}>
        <div className="h-64" role="img" aria-label={t("ov.dist.title")}><ResponsiveContainer>
          <BarChart data={byDomain} layout="vertical" margin={{ left: 4, right: 12 }}>
            <CartesianGrid stroke={ch.grid} horizontal={false} />
            <XAxis type="number" allowDecimals={false} stroke={ch.axis} fontSize={11} tickLine={false} />
            <YAxis type="category" dataKey="name" width={150} stroke={ch.axis} fontSize={11} tickLine={false} axisLine={false} />
            <Tooltip {...tip} />
            <Bar dataKey="count" radius={[0, 6, 6, 0]} barSize={18}>{byDomain.map((_, i) => <Cell key={i} fill={color(i)} />)}</Bar>
          </BarChart>
        </ResponsiveContainer></div>
      </Panel>
      <Panel className="lg:col-span-2" title={t("ov.land.title")} sub={t("ov.land.sub")}>
        <div className="relative h-64" role="img" aria-label={t("ov.land.title")}>
          <ResponsiveContainer>
            <PieChart>
              <Pie data={fuel} dataKey="count" nameKey="name" innerRadius={58} outerRadius={88} stroke="none" paddingAngle={3} cornerRadius={4}>
                {fuel.map((_, i) => <Cell key={i} fill={color(i)} />)}
              </Pie>
              <Tooltip {...tip} />
            </PieChart>
          </ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 grid place-items-center text-center"><div><div className="font-mono text-3xl font-semibold text-fg">{total}</div><div className="label">{t("ov.land.total")}</div></div></div>
        </div>
        <ul className="mt-2 flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-muted">{fuel.map((f, i) => <li key={f.name} className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full" style={{ background: color(i) }} />{f.name} · {f.count}</li>)}</ul>
      </Panel>
    </div>
  );
}
