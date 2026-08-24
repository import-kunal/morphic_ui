import { z } from "zod";
import { defineComponent } from "@/packages/engine";
import { InfoIcon, AlertTriangleIcon, XCircleIcon, CheckCircleIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ComponentRendererProps } from "@/packages/engine/types";
import type { ReactNode } from "react";

const variantStyles = {
  info:    { icon: InfoIcon,         className: "bg-primary/8  border-primary/20  text-primary",      iconClass: "text-primary" },
  warning: { icon: AlertTriangleIcon,className: "bg-amber-500/8  border-amber-500/25 text-amber-400",  iconClass: "text-amber-400" },
  error:   { icon: XCircleIcon,      className: "bg-destructive/8 border-destructive/25 text-destructive-foreground/80", iconClass: "text-destructive" },
  success: { icon: CheckCircleIcon,  className: "bg-green-500/8 border-green-500/25 text-green-400",  iconClass: "text-green-400" },
} as const;

export const Callout = defineComponent({
  name: "Callout",
  description: "An alert callout box for info, warning, error, or success messages.",
  props: z.object({
    message: z.string(),
    variant: z.enum(["info", "warning", "error", "success"]).optional().default("info"),
  }),
  component: ({ props }: ComponentRendererProps): ReactNode => {
    const variant = (props["variant"] as keyof typeof variantStyles) ?? "info";
    const { icon: Icon, className, iconClass } = variantStyles[variant];

    return (
      <div className={cn("flex items-start gap-3 rounded-xl border px-4 py-3 text-sm", className)}>
        <Icon className={cn("h-4 w-4 mt-0.5 shrink-0", iconClass)} />
        <span className="leading-relaxed">{props["message"] as string}</span>
      </div>
    );
  },
});
