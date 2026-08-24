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
  RadarChart as ReRadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
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

export const RadarChart = defineComponent({
  name: "RadarChart",
  description: "Radar/spider chart for comparing multiple metrics across categories. metrics[] are the axis labels, series[] are { name, data[] } objects with one value per metric.",
  props: z.object({
    metrics: z.array(z.string()),
    series:  z.array(z.object({ name: z.string(), data: z.array(z.number()) })),
    height:  z.number().optional().default(300),
  }),
  component: ({ props }: ComponentRendererProps): ReactNode => {
    const metrics = props["metrics"] as string[] | null;
    const series  = props["series"]  as { name: string; data: number[] }[] | null;
    const height  = (props["height"] as number) ?? 300;

    if (!Array.isArray(metrics) || !Array.isArray(series)) return null;

    const validSeries = series.filter((s) => typeof s?.name === "string");

    const data = metrics.map((metric, i) => {
      const row: Record<string, string | number> = { metric };
      for (const s of validSeries) {
        row[s.name] = Array.isArray(s.data) ? (s.data[i] ?? 0) : 0;
      }
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
        <ReRadarChart data={data}>
          <PolarGrid />
          <PolarAngleAxis dataKey="metric" className="text-xs" />
          <ChartTooltip content={<ChartTooltipContent />} />
          <ChartLegend content={<ChartLegendContent />} />
          {validSeries.map((s, i) => (
            <Radar
              key={s.name}
              name={s.name}
              dataKey={s.name}
              stroke={CHART_COLORS[i % CHART_COLORS.length]}
              fill={CHART_COLORS[i % CHART_COLORS.length]}
              fillOpacity={0.2}
            />
          ))}
        </ReRadarChart>
      </ChartContainer>
    );
  },
});
