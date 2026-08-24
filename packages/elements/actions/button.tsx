import { z } from "zod";
import { defineComponent } from "@/packages/engine";
import { Button as ShadButton } from "@/components/ui/button";
import type { ComponentRendererProps, ActionPlan } from "@/packages/engine/types";
import type { ReactNode } from "react";

const sizeMap = { sm: "sm", md: "default", lg: "lg" } as const;

export const Button = defineComponent({
  name: "Button",
  description: "A clickable button. Specify action= to trigger state changes or navigation.",
  props: z.object({
    label:   z.string(),
    action:  z.unknown().optional(),
    variant: z.enum(["default", "secondary", "outline", "ghost", "destructive", "link"]).optional().default("default"),
    size:    z.enum(["sm", "md", "lg"]).optional().default("md"),
  }),
  component: ({ props, triggerAction }: ComponentRendererProps): ReactNode => {
    const sz = sizeMap[(props["size"] as keyof typeof sizeMap) ?? "md"];

    function handleClick() {
      if (props["action"]) triggerAction(props["action"] as ActionPlan);
    }

    return (
      <ShadButton
        variant={(props["variant"] as "default" | "secondary" | "outline" | "ghost" | "destructive" | "link") ?? "default"}
        size={sz}
        onClick={handleClick}
      >
        {props["label"] as string}
      </ShadButton>
    );
  },
});
