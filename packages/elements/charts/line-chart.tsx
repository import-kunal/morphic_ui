
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
  LineChart as ReLineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";
import type { ComponentRendererProps } from "@/packages/engine/types";
import type { ReactNode } from "react";
import { focusedNumericDomain, formatAxisValue } from "./axis-domain";

const CHART_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
] as const;

export const LineChart = defineComponent({
  name: "LineChart",
  description: "Line chart for chronological trends. categories[] are X-axis labels and series[] are { name, data[] } objects. yAxisMode=auto focuses the scale around the observed range with padding; use zero only when a zero baseline is essential.",
  props: z.object({
    categories: z.array(z.string()),
    series:     z.array(z.object({ name: z.string(), data: z.array(z.number()) })),
    yAxisMode:  z.enum(["auto", "zero"]).optional().default("auto"),
    height:     z.number().optional().default(300),
  }),
  component: ({ props }: ComponentRendererProps): ReactNode => {
    const categories = props["categories"] as string[] | null;
    const series     = props["series"]     as { name: string; data: number[] }[] | null;
    const yAxisMode  = (props["yAxisMode"] as "auto" | "zero") ?? "auto";
    const height     = (props["height"]    as number) ?? 300;

    if (!Array.isArray(categories) || !Array.isArray(series)) return null;

    const validSeries = series.filter((s) => typeof s?.name === "string");
    const yDomain = focusedNumericDomain(validSeries, yAxisMode === "zero");

    const data = categories.map((cat, i) => {
      const row: Record<string, string | number> = { category: cat };
      for (const s of validSeries) {
        const value = Array.isArray(s.data) ? s.data[i] : undefined;
        if (typeof value === "number" && Number.isFinite(value)) {
          row[s.name] = value;
        }
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
        <ReLineChart data={data} margin={{ top: 5, right: 20, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="category" tickLine={false} axisLine={false} padding={{ left: 10, right: 20 }} />
          <YAxis
            domain={yDomain}
            tickFormatter={formatAxisValue}
            tickLine={false}
            axisLine={false}
            width={58}
          />
          <ChartTooltip content={<ChartTooltipContent />} />
          <ChartLegend content={<ChartLegendContent />} />
          {validSeries.map((s, i) => (
            <Line
              key={s.name}
              type="monotone"
              dataKey={s.name}
              stroke={CHART_COLORS[i % CHART_COLORS.length]}
              strokeWidth={2}
              dot={false}
            />
          ))}
        </ReLineChart>
      </ChartContainer>
    );
  },
});
