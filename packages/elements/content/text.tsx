
import { z } from "zod";
import { defineComponent } from "@/packages/engine";
import { cn } from "@/lib/utils";
import { textSize, fontWeight, textColor } from "@/lib/tokens";
import type { ComponentRendererProps } from "@/packages/engine/types";
import type { ReactNode } from "react";

export const Text = defineComponent({
  name: "Text",
  description: "A styled text block. Use for headings, labels, and body copy.",
  props: z.object({
    content: z.string(),
    size:    z.enum(["xs", "sm", "base", "lg", "xl", "2xl", "3xl"]).optional().default("base"),
    weight:  z.enum(["normal", "medium", "semibold", "bold"]).optional().default("normal"),
    color:   z.enum(["default", "muted", "primary", "destructive", "success", "warning"]).optional().default("default"),
  }),
  component: ({ props }: ComponentRendererProps): ReactNode => {
    const sz  = (props["size"]   as keyof typeof textSize)   ?? "base";
    const wt  = (props["weight"] as keyof typeof fontWeight) ?? "normal";
    const col = (props["color"]  as keyof typeof textColor)  ?? "default";

    return (
      <p className={cn(textSize[sz], fontWeight[wt], textColor[col])}>
        {props["content"] as string}
      </p>
    );
  },
});
