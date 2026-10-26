import { Link, useNavigate } from "@tanstack/react-router";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  XAxis,
  YAxis,
} from "recharts";
import {
  ArrowUpRight,
  ChartNoAxesCombined,
  CircleCheck,
  ClipboardList,
  UsersRound,
} from "lucide-react";
import type { getPlanningDashboard } from "@/server/functions/planning-dashboard";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { Badge } from "@/components/ui/badge";

export function PlanningDashboard({
  data,
}: {
  data: Awaited<ReturnType<typeof getPlanningDashboard>>;
}) {
  const navigate = useNavigate();
  const metrics = data.metrics;
  const seasons = [
    ...new Map(
      data.options.map((item) => [item.seasonId, item.seasonName]),
    ).entries(),
  ];
  return (
    <div className="space-y-6">
      <header className="from-pm-mist rounded-2xl border bg-gradient-to-br via-white to-amber-50/60 p-6">
        <p className="text-primary mb-2 flex items-center gap-2 text-xs font-semibold tracking-widest uppercase">
          <ChartNoAxesCombined className="size-4" /> Season at a glance
        </p>
        <h1 className="text-3xl font-semibold">Planning readiness</h1>
        <p className="text-muted-foreground mt-2 text-sm">
          From enrollment to the first lesson. See what’s ready and what needs
          attention.
        </p>
        <div className="mt-5 flex flex-wrap gap-4">
          <label className="text-muted-foreground grid gap-1.5 text-xs font-medium">
            Season
            <select
              className="text-foreground h-9 rounded-lg border bg-white px-3 text-sm shadow-xs"
              value={data.selected?.seasonId ?? ""}
              onChange={(event) =>
                navigate({
                  to: "/admin",
                  search: { seasonId: event.target.value },
                })
              }
            >
              {seasons.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-muted-foreground grid gap-1.5 text-xs font-medium">
            Program
            <select
              className="text-foreground h-9 rounded-lg border bg-white px-3 text-sm shadow-xs"
              value={data.selected?.id ?? ""}
              onChange={(event) =>
                navigate({
                  to: "/admin",
                  search: {
                    programId: event.target.value,
                    seasonId: data.selected?.seasonId,
                  },
                })
              }
            >
              {data.options
                .filter(
                  (item) =>
                    !data.selected || item.seasonId === data.selected.seasonId,
                )
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
            </select>
          </label>
        </div>
      </header>
      {!metrics ? (
        <p>Configure a season and program to see planning metrics.</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <Badge variant="secondary">{metrics.stage} planning</Badge>
            <span className="text-muted-foreground">
              {metrics.stages.draft} draft · {metrics.stages.finalized}{" "}
              finalized · {metrics.stages.published} published groups
            </span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["Students", metrics.students, "/admin/students"],
              [
                "Active registrations",
                metrics.registrations,
                "/admin/students",
              ],
              ["Need placement", metrics.unplaced, "/grouping"],
              ["Missing information", metrics.missingInformation, "/grouping"],
              [
                "Students with surveys",
                metrics.surveyCovered,
                "/admin/surveys",
              ],
              ["Unstaffed groups", metrics.unstaffed, "/grouping"],
              ["Pending changes", metrics.pendingChanges, "/grouping"],
              [`${metrics.stage} groups`, metrics.groups, "/grouping"],
            ].map(([label, value, href]) => (
              <a
                key={String(label)}
                href={`${href}?programId=${data.selected.id}${label === "Need placement" ? "&view=unplaced" : label === "Missing information" ? "&view=review" : label === "Unstaffed groups" ? "&staffing=unstaffed&allSessions=true" : ""}`}
                className="group hover:border-primary/40 relative rounded-xl border bg-white p-4 shadow-xs transition hover:-translate-y-0.5 hover:shadow-md"
              >
                <span className="text-muted-foreground flex items-center justify-between text-xs font-medium">
                  {label}
                  <ArrowUpRight className="size-4 opacity-40 transition group-hover:opacity-100" />
                </span>
                <strong className="mt-2 block text-3xl tracking-tight tabular-nums">
                  {value}
                </strong>
              </a>
            ))}
          </div>
          <div className="grid gap-5 lg:grid-cols-2">
            {data.charts.map((chart, index) => (
              <PlanningChart
                key={chart.title}
                chart={chart}
                programId={data.selected.id}
                index={index}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

const palette = [
  "#365b31",
  "#d39832",
  "#588c88",
  "#8b729c",
  "#99ae79",
  "#c87958",
  "#52758d",
];
type DashboardChart = Awaited<
  ReturnType<typeof getPlanningDashboard>
>["charts"][number];
function PlanningChart({
  chart,
  programId,
  index,
}: {
  chart: DashboardChart;
  programId: string;
  index: number;
}) {
  const navigate = useNavigate();
  const total = chart.rows.reduce((sum, row) => sum + row.value, 0);
  const isDonut = index === 3 || index === 4;
  const rows = chart.rows.map((row, position) => ({
    ...row,
    fill:
      index === 4 && row.label === "Unstaffed"
        ? "#d39832"
        : palette[position % palette.length],
  }));
  const config = {
    value: { label: index < 2 ? "Registrations" : "Groups", color: palette[0] },
  };
  const descriptions = [
    "Enrollment across your teaching sessions",
    "Ability mix across registered disciplines",
    "Where your current groups are concentrated",
    "How students are distributed across groups",
    "Lead instructor assignments for occupied groups",
  ];
  const Icon =
    index < 2 ? UsersRound : index === 4 ? CircleCheck : ClipboardList;
  const openRow = (row: DashboardChart["rows"][number]) =>
    void navigate({ to: "/grouping", search: { ...row.filters, programId } });
  return (
    <section className="min-w-0 overflow-hidden rounded-xl border bg-white shadow-xs">
      <header className="flex items-start justify-between gap-3 px-5 pt-5">
        <div>
          <h2 className="font-semibold tracking-tight">{chart.title}</h2>
          <p className="text-muted-foreground mt-1 text-xs">
            {descriptions[index]}
          </p>
        </div>
        <span className="bg-pm-mist text-primary rounded-lg p-2">
          <Icon className="size-4" />
        </span>
      </header>
      {rows.length ? (
        <div className="px-3 pt-5">
          {isDonut ? (
            <div className="relative">
              <ChartContainer config={config} className="h-[240px] w-full">
                <PieChart accessibilityLayer>
                  <ChartTooltip
                    content={<ChartTooltipContent nameKey="label" hideLabel />}
                  />
                  <Pie
                    isAnimationActive={false}
                    data={rows}
                    dataKey="value"
                    nameKey="label"
                    innerRadius={70}
                    outerRadius={100}
                    paddingAngle={rows.length > 1 ? 4 : 0}
                    strokeWidth={3}
                  >
                    {rows.map((row) => (
                      <Cell
                        key={row.label}
                        fill={row.fill}
                        className="cursor-pointer outline-none"
                        onClick={() => openRow(row)}
                      />
                    ))}
                  </Pie>
                </PieChart>
              </ChartContainer>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <strong className="text-3xl tabular-nums">{total}</strong>
                <span className="text-muted-foreground text-xs">groups</span>
              </div>
            </div>
          ) : (
            <div className="max-h-[300px] overflow-y-auto overscroll-contain">
              <ChartContainer
                config={config}
                className="w-full"
                style={{ height: Math.max(240, rows.length * 42) }}
              >
                <BarChart
                  accessibilityLayer
                  data={rows}
                  layout="vertical"
                  margin={{ left: 0, right: 28, top: 4, bottom: 0 }}
                >
                  <CartesianGrid horizontal={false} strokeDasharray="3 3" />
                  <XAxis
                    type="number"
                    allowDecimals={false}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="label"
                    width={145}
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 11 }}
                  />
                  <ChartTooltip
                    cursor={{ fill: "#f5f5f0" }}
                    content={<ChartTooltipContent nameKey="label" hideLabel />}
                  />
                  <Bar
                    isAnimationActive={false}
                    dataKey="value"
                    radius={[0, 5, 5, 0]}
                    maxBarSize={24}
                  >
                    {rows.map((row) => (
                      <Cell
                        key={row.label}
                        fill={row.fill}
                        className="cursor-pointer"
                        onClick={() => openRow(row)}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ChartContainer>
            </div>
          )}
          {isDonut && (
            <div className="flex flex-wrap justify-center gap-x-4 gap-y-2 px-3 pb-4">
              {rows.map((row) => (
                <button
                  key={row.label}
                  onClick={() => openRow(row)}
                  className="flex items-center gap-2 text-xs hover:underline"
                >
                  <span
                    className="size-2.5 rounded-full"
                    style={{ backgroundColor: row.fill }}
                  />
                  {row.label}
                  <strong>{row.value}</strong>
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="m-5 flex h-[220px] flex-col items-center justify-center rounded-lg border border-dashed bg-stone-50/60 text-center">
          <Icon className="text-muted-foreground/40 mb-3 size-8" />
          <p className="text-sm font-medium">Your groups will appear here</p>
          <p className="text-muted-foreground mt-1 max-w-56 text-xs">
            Start placing students to see the shape of your program.
          </p>
          <Link
            to="/grouping"
            search={{ programId }}
            className="text-primary mt-4 text-xs font-medium underline underline-offset-4"
          >
            Open group builder
          </Link>
        </div>
      )}
      {rows.length > 0 && (
        <details className="border-t px-5 py-3 text-xs">
          <summary className="text-muted-foreground cursor-pointer">
            View data and open a filtered group view
          </summary>
          <table className="mt-3 w-full">
            <thead>
              <tr className="text-muted-foreground border-b">
                <th className="pb-2 text-left font-medium">Category</th>
                <th className="pb-2 text-right font-medium">Count</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.label} className="border-b last:border-0">
                  <td className="py-2">
                    <Link
                      to="/grouping"
                      search={{ ...row.filters, programId }}
                      className="hover:underline"
                    >
                      {row.label}
                    </Link>
                  </td>
                  <td className="text-right tabular-nums">{row.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}
    </section>
  );
}
