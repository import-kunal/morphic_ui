import { z } from "zod";
import { defineComponent } from "@/packages/engine";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { FunnelChart as ReFunnelChart, Funnel, LabelList } from "recharts";
import type { ComponentRendererProps } from "@/packages/engine/types";
import type { ReactNode } from "react";

const CHART_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
] as const;

export const FunnelChart = defineComponent({
  name: "FunnelChart",
  description: "Funnel chart for showing stages or drop-off. data[] is { label, value } objects, ordered from largest to smallest.",
  props: z.object({
    data:   z.array(z.object({ label: z.string(), value: z.number() })),
    height: z.number().optional().default(300),
  }),
  component: ({ props }: ComponentRendererProps): ReactNode => {
    const data   = props["data"]   as { label: string; value: number }[] | null;
    const height = (props["height"] as number) ?? 300;

    if (!Array.isArray(data) || data.length === 0) return null;

    const validData = data.filter(
      (d) => typeof d?.label === "string" && typeof d?.value === "number"
    );
    if (validData.length === 0) return null;

    const chartData = validData.map((d, i) => ({
      name:  d.label,
      value: d.value,
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
        <ReFunnelChart>
          <ChartTooltip content={<ChartTooltipContent />} />
          <Funnel dataKey="value" data={chartData} isAnimationActive>
            <LabelList
              position="inside"
              fill="white"
              stroke="none"
              dataKey="name"
              className="text-xs font-medium"
            />
          </Funnel>
        </ReFunnelChart>
      </ChartContainer>
    );
  },
});
