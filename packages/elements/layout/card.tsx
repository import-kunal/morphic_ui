import { z } from "zod";
import { defineComponent } from "@/packages/engine";
import { cn } from "@/lib/utils";
import type { ComponentRendererProps } from "@/packages/engine/types";
import type { ReactNode } from "react";

export const Card = defineComponent({
  name: "Card",
  description: "A card container with optional title and footer. Use to group related content with a visual boundary.",
  props: z.object({
    children: z.array(z.unknown()),
    title:    z.string().optional(),
    footer:   z.string().optional(),
  }),
  component: ({ props, renderNode }: ComponentRendererProps): ReactNode => {
    const title  = props["title"]  as string | undefined;
    const footer = props["footer"] as string | undefined;

    return (
      <div className={cn(
        "w-full rounded-xl border border-border bg-card overflow-hidden",
        "shadow-[0_1px_3px_0_oklch(0_0_0/0.2),0_0_0_1px_var(--border)]"
      )}>
        {title && (
          <div className="px-5 pt-5 pb-3 border-b border-border/60">
            <h3 className="text-sm font-semibold tracking-tight text-foreground">{title}</h3>
          </div>
        )}
        <div className={cn("p-5", !title && "pt-5")}>
          {renderNode(props["children"]) as ReactNode}
        </div>
        {footer && (
          <div className="border-t border-border/60 px-5 py-3 bg-muted/30">
            <p className="text-xs text-muted-foreground">{footer}</p>
          </div>
        )}
      </div>
    );
  },
});
