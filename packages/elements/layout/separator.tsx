
import { z } from "zod";
import { defineComponent } from "@/packages/engine";
import { Separator as ShadSeparator } from "@/components/ui/separator";
import type { ComponentRendererProps } from "@/packages/engine/types";
import type { ReactNode } from "react";

export const Separator = defineComponent({
  name: "Separator",
  description: "A visual divider line. Use between sections.",
  props: z.object({
    orientation: z.enum(["horizontal", "vertical"]).optional().default("horizontal"),
  }),
  component: ({ props }: ComponentRendererProps): ReactNode => {
    return (
      <ShadSeparator
        orientation={(props["orientation"] as "horizontal" | "vertical") ?? "horizontal"}
      />
    );
  },
});
