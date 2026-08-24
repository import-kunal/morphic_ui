
import { z } from "zod";
import { defineComponent } from "@/packages/engine";
import { Badge } from "@/components/ui/badge";
import type { ComponentRendererProps } from "@/packages/engine/types";
import type { ReactNode } from "react";

export const Tag = defineComponent({
  name: "Tag",
  description: "A small badge or tag label. Good for status indicators and categories.",
  props: z.object({
    label:   z.string(),
    variant: z.enum(["default", "secondary", "destructive", "outline"]).optional().default("secondary"),
  }),
  component: ({ props }: ComponentRendererProps): ReactNode => {
    return (
      <Badge
        variant={(props["variant"] as "default" | "secondary" | "destructive" | "outline") ?? "secondary"}
      >
        {props["label"] as string}
      </Badge>
    );
  },
});
