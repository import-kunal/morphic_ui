
import { z } from "zod";
import { defineComponent } from "@/packages/engine";
import type { ComponentRendererProps } from "@/packages/engine/types";
import type { ReactNode } from "react";

export const ButtonGroup = defineComponent({
  name: "ButtonGroup",
  description: "A horizontal row of buttons.",
  props: z.object({
    children: z.array(z.unknown()),
  }),
  component: ({ props, renderNode }: ComponentRendererProps): ReactNode => {
    return (
      <div className="flex flex-wrap gap-2">
        {renderNode(props["children"]) as ReactNode}
      </div>
    );
  },
});
