import { z } from "zod";
import { defineComponent } from "@/packages/engine";
import { Slider as ShadSlider } from "@/components/ui/slider";
import type { ComponentRendererProps } from "@/packages/engine/types";
import type { ReactNode } from "react";

export const Slider = defineComponent({
  name: "Slider",
  description: "A range slider bound to a $variable.",
  props: z.object({
    min:      z.number(),
    max:      z.number(),
    value:    z.number(),
    step:     z.number().optional().default(1),
    label:    z.string().optional(),
    stateKey: z.string().optional(),
  }),
  component: ({ props, triggerAction }: ComponentRendererProps): ReactNode => {
    const min   = props["min"]   as number | null;
    const max   = props["max"]   as number | null;
    const value = props["value"] as number | null;
    if (min === null || max === null || value === null) return null;

    const stateKey = props["stateKey"] as string | undefined;

    function handleChange(vals: number[]) {
      const val = vals[0] ?? 0;
      if (stateKey) {
        triggerAction({
          steps: [{ type: "set", target: stateKey, valueAST: { k: "Num", value: val } }],
        });
      }
    }

    return (
      <div className="flex flex-col gap-2">
        {props["label"] ? (
          <div className="flex justify-between text-sm">
            <label className="font-medium">{props["label"] as string}</label>
            <span className="text-muted-foreground">{value}</span>
          </div>
        ) : null}
        <ShadSlider
          min={min}
          max={max}
          step={(props["step"] as number) ?? 1}
          value={[value]}
          onValueChange={handleChange}
        />
      </div>
    );
  },
});
