
import { z } from "zod";
import { defineComponent } from "@/packages/engine";
import { cn } from "@/lib/utils";
import { gap, direction, align, justify } from "@/lib/tokens";
import type { ComponentRendererProps } from "@/packages/engine/types";
import type { ReactNode } from "react";

export const Stack = defineComponent({
  name: "Stack",
  description: "Flex container for laying out children. Direction defaults to column. direction=\"row\" auto-collapses to column on mobile — prefer row for side-by-side sections, column for stacked content.",
  props: z.object({
    children: z.array(z.unknown()),
    direction: z.enum(["row", "column"]).optional().default("column"),
    gap: z.enum(["none", "xs", "sm", "md", "lg", "xl"]).optional().default("md"),
    align: z.enum(["start", "center", "end", "stretch"]).optional().default("stretch"),
    justify: z.enum(["start", "center", "end", "between"]).optional().default("start"),
    wrap: z.boolean().optional().default(false),
  }),
  component: ({ props, renderNode }: ComponentRendererProps): ReactNode => {
    const dir  = (props["direction"] as keyof typeof direction) ?? "column";
    const g    = (props["gap"]       as keyof typeof gap)       ?? "md";
    const al   = (props["align"]     as keyof typeof align)     ?? "stretch";
    const jus  = (props["justify"]   as keyof typeof justify)   ?? "start";
    const wrap = props["wrap"] as boolean ?? false;

    const isRow = dir === "row";

    return (
      <div
        className={cn(
          "flex w-full [&>*]:min-w-0",
          direction[dir],
          gap[g],
          align[al],
          justify[jus],
          wrap && "flex-wrap",
          // Equal-width children in row mode — metric cards, stat grids, etc.
          isRow && "[&>*]:flex-1",
        )}
      >
        {renderNode(props["children"]) as ReactNode}
      </div>
    );
  },
});
