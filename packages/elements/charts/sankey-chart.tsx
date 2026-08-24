import { z } from "zod";
import { defineComponent } from "@/packages/engine";
import { Sankey, Tooltip } from "recharts";
import type { ComponentRendererProps } from "@/packages/engine/types";
import type { ReactNode } from "react";

const CHART_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
] as const;

export const SankeyChart = defineComponent({
  name: "SankeyChart",
  description: "Sankey flow diagram. nodes[] are label strings. links[] are { from, to, value } objects using the node label names (not indices) — the engine maps them to indices automatically.",
  props: z.object({
    nodes:  z.array(z.string()),
    links:  z.array(z.object({ from: z.string(), to: z.string(), value: z.number() })),
    height: z.number().optional().default(300),
  }),
  component: ({ props }: ComponentRendererProps): ReactNode => {
    const nodeNames = props["nodes"] as string[] | null;
    const links     = props["links"] as { from: string; to: string; value: number }[] | null;
    const height    = (props["height"] as number) ?? 300;

    if (!Array.isArray(nodeNames) || !Array.isArray(links)) return null;
    if (nodeNames.length === 0 || links.length === 0) return null;

    // Build index map — LLM uses names, Recharts needs numeric indices.
    const indexMap = new Map(nodeNames.map((name, i) => [name, i]));

    const rechartsNodes = nodeNames.map((name, i) => ({
      name,
      fill: CHART_COLORS[i % CHART_COLORS.length],
    }));

    const rechartsLinks = links
      .map((l) => ({
        source: indexMap.get(l.from) ?? -1,
        target: indexMap.get(l.to)   ?? -1,
        value:  l.value,
      }))
      .filter((l) => l.source >= 0 && l.target >= 0 && l.source !== l.target);

    if (rechartsLinks.length === 0) return null;

    return (
      <div style={{ height, width: "100%" }} className="overflow-x-auto">
        <Sankey
          width={600}
          height={height}
          data={{ nodes: rechartsNodes, links: rechartsLinks }}
          nodePadding={24}
          nodeWidth={12}
          linkCurvature={0.5}
          iterations={32}
          node={({ x, y, width: w, height: h, payload }: {
            x: number; y: number; width: number; height: number;
            payload: { name: string; fill?: string };
          }) => (
            <g>
              <rect
                x={x} y={y} width={w} height={h}
                fill={payload.fill ?? "var(--chart-1)"}
                fillOpacity={0.9}
                rx={2}
              />
              <text
                x={x + w + 6}
                y={y + h / 2}
                dominantBaseline="middle"
                fontSize={11}
                fill="currentColor"
                className="fill-foreground"
              >
                {payload.name}
              </text>
            </g>
          )}
        >
          <Tooltip
            formatter={(value: number, name: string) => [value, name]}
          />
        </Sankey>
      </div>
    );
  },
});
