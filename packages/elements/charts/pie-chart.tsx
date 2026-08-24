
import { z } from "zod";
import { defineComponent } from "@/packages/engine";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
} from "@/components/ui/chart";
import { PieChart as RePieChart, Pie, Cell } from "recharts";
import type { ComponentRendererProps } from "@/packages/engine/types";
import type { ReactNode } from "react";

const CHART_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
] as const;

export const PieChart = defineComponent({
  name: "PieChart",
  description: "Pie or donut chart. data[] is an array of { label, value } objects.",
  props: z.object({
    data:  z.array(z.object({ label: z.string(), value: z.number() })),
    donut: z.boolean().optional().default(false),
  }),
  component: ({ props }: ComponentRendererProps): ReactNode => {
    const data  = props["data"]  as { label: string; value: number }[] | null;
    const donut = props["donut"] as boolean ?? false;

    if (!Array.isArray(data)) return null;

    const validData = data.filter((d) => typeof d?.label === "string" && typeof d?.value === "number");
    if (validData.length === 0) return null;

    const chartConfig = Object.fromEntries(
      validData.map((d, i) => [
        d.label,
        { label: d.label, color: CHART_COLORS[i % CHART_COLORS.length] },
      ])
    );

    const rechartData = validData.map((d) => ({ name: d.label, value: d.value }));

    return (
      <ChartContainer config={chartConfig} className="w-full" style={{ height: 300 }}>
        <RePieChart>
          <ChartTooltip content={<ChartTooltipContent />} />
          <ChartLegend content={<ChartLegendContent />} />
          <Pie
            data={rechartData}
            dataKey="value"
            nameKey="name"
            innerRadius={donut ? "60%" : 0}
            strokeWidth={2}
          >
            {rechartData.map((_, i) => (
              <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
            ))}
          </Pie>
        </RePieChart>
      </ChartContainer>
    );
  },
});
