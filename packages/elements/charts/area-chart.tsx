
import { z } from "zod";
import { defineComponent } from "@/packages/engine";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
} from "@/components/ui/chart";
import {
  AreaChart as ReAreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";
import type { ComponentRendererProps } from "@/packages/engine/types";
import type { ReactNode } from "react";

const CHART_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
] as const;

export const AreaChart = defineComponent({
  name: "AreaChart",
  description: "Area chart with fill. categories[] are X-axis labels, series[] are { name, data[] } objects.",
  props: z.object({
    categories: z.array(z.string()),
    series:     z.array(z.object({ name: z.string(), data: z.array(z.number()) })),
    stacked:    z.boolean().optional().default(false),
    height:     z.number().optional().default(300),
  }),
  component: ({ props }: ComponentRendererProps): ReactNode => {
    const categories = props["categories"] as string[] | null;
    const series     = props["series"]     as { name: string; data: number[] }[] | null;
    const stacked    = props["stacked"]    as boolean ?? false;
    const height     = (props["height"]    as number) ?? 300;

    if (!Array.isArray(categories) || !Array.isArray(series)) return null;

    const validSeries = series.filter((s) => typeof s?.name === "string");

    const data = categories.map((cat, i) => {
      const row: Record<string, string | number> = { category: cat };
      for (const s of validSeries) row[s.name] = Array.isArray(s.data) ? (s.data[i] ?? 0) : 0;
      return row;
    });

    const chartConfig = Object.fromEntries(
      validSeries.map((s, i) => [
        s.name,
        { label: s.name, color: CHART_COLORS[i % CHART_COLORS.length] },
      ])
    );

    return (
      <ChartContainer config={chartConfig} className="w-full" style={{ height }}>
        <ReAreaChart data={data} margin={{ top: 5, right: 20, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="category" tickLine={false} axisLine={false} padding={{ left: 10, right: 20 }} />
          <YAxis tickLine={false} axisLine={false} width={45} />
          <ChartTooltip content={<ChartTooltipContent />} />
          <ChartLegend content={<ChartLegendContent />} />
          {validSeries.map((s, i) => (
            <Area
              key={s.name}
              type="monotone"
              dataKey={s.name}
              stroke={CHART_COLORS[i % CHART_COLORS.length]}
              fill={CHART_COLORS[i % CHART_COLORS.length]}
              fillOpacity={0.2}
              stackId={stacked ? "stack" : undefined}
              strokeWidth={2}
            />
          ))}
        </ReAreaChart>
      </ChartContainer>
    );
  },
});
