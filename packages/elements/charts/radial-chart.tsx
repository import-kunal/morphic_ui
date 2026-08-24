import { z } from "zod";
import { defineComponent } from "@/packages/engine";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
} from "@/components/ui/chart";
import { RadialBarChart as ReRadialBarChart, RadialBar } from "recharts";
import type { ComponentRendererProps } from "@/packages/engine/types";
import type { ReactNode } from "react";

const CHART_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
] as const;

export const RadialChart = defineComponent({
  name: "RadialChart",
  description: "Radial bar chart — circular progress bars stacked outward. data[] is { label, value } objects. maxValue sets the full-bar ceiling (default 100).",
  props: z.object({
    data:     z.array(z.object({ label: z.string(), value: z.number() })),
    maxValue: z.number().optional().default(100),
    height:   z.number().optional().default(300),
  }),
  component: ({ props }: ComponentRendererProps): ReactNode => {
    const data     = props["data"]     as { label: string; value: number }[] | null;
    const maxValue = Math.max(1, (props["maxValue"] as number) ?? 100);
    const height   = (props["height"]  as number) ?? 300;

    if (!Array.isArray(data)) return null;

    const validData = data.filter(
      (d) => typeof d?.label === "string" && typeof d?.value === "number" && isFinite(d.value)
    );
    if (validData.length === 0) return null;

    // Normalise to 0–100 so Recharts never sees out-of-domain values.
    // This removes the need for PolarRadiusAxis (which causes NaN on first render).
    const chartData = validData.map((d, i) => ({
      name:  d.label,
      value: Math.min(100, Math.max(0, (d.value / maxValue) * 100)),
      fill:  CHART_COLORS[i % CHART_COLORS.length],
    }));

    const chartConfig = Object.fromEntries(
      validData.map((d, i) => [
        d.label,
        { label: d.label, color: CHART_COLORS[i % CHART_COLORS.length] },
      ])
    );

    return (
      <ChartContainer config={chartConfig} className="w-full" style={{ height }}>
        <ReRadialBarChart
          data={chartData}
          innerRadius="25%"
          outerRadius="85%"
          startAngle={90}
          endAngle={-270}
        >
          <RadialBar
            dataKey="value"
            background={{ fill: "var(--muted)" }}
            cornerRadius={4}
          />
          <ChartTooltip content={<ChartTooltipContent />} />
          <ChartLegend content={<ChartLegendContent />} />
        </ReRadialBarChart>
      </ChartContainer>
    );
  },
});
