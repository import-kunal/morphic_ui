import { z } from "zod";
import { defineComponent } from "@/packages/engine";
import { cn } from "@/lib/utils";
import { gap, gridColumns } from "@/lib/tokens";
import type { ComponentRendererProps } from "@/packages/engine/types";
import type { ReactNode } from "react";

export const Grid = defineComponent({
  name: "Grid",
  description: "Responsive CSS grid for card galleries and image grids. columns=2 gives a 2-up layout (1 col on mobile, 2 on tablet+). Use instead of Stack(direction=\"row\") when you want wrapping cards.",
  props: z.object({
    children: z.array(z.unknown()),
    columns:  z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]).optional().default(2),
    gap:      z.enum(["none", "xs", "sm", "md", "lg", "xl"]).optional().default("md"),
  }),
  component: ({ props, renderNode }: ComponentRendererProps): ReactNode => {
    const cols = ((props["columns"] as number | null) ?? 2) as keyof typeof gridColumns;
    const g    = (props["gap"] as keyof typeof gap) ?? "md";

    return (
      <div className={cn("grid w-full", gridColumns[cols] ?? gridColumns[2], gap[g])}>
        {renderNode(props["children"]) as ReactNode}
      </div>
    );
  },
});
