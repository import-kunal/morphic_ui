import { z } from "zod";
import { defineComponent } from "@/packages/engine";
import { Input as ShadInput } from "@/components/ui/input";
import type { ComponentRendererProps } from "@/packages/engine/types";
import type { ReactNode } from "react";

export const Input = defineComponent({
  name: "Input",
  description: "A text input bound to a $variable. value=$var stores what the user types.",
  props: z.object({
    value:       z.string(),
    label:       z.string().optional(),
    placeholder: z.string().optional(),
    stateKey:    z.string().optional(),
  }),
  component: ({ props, triggerAction }: ComponentRendererProps): ReactNode => {
    const stateKey = props["stateKey"] as string | undefined;

    function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
      if (stateKey) {
        triggerAction({
          steps: [{ type: "set", target: stateKey, valueAST: { k: "Str", value: e.target.value } }],
        });
      }
    }

    return (
      <div className="flex flex-col gap-1.5">
        {props["label"] ? (
          <label className="text-sm font-medium">{props["label"] as string}</label>
        ) : null}
        <ShadInput
          value={(props["value"] as string | null) ?? ""}
          placeholder={(props["placeholder"] as string) ?? ""}
          onChange={handleChange}
        />
      </div>
    );
  },
});
