import { z } from "zod";
import { defineComponent } from "@/packages/engine";
import { RadioGroup as ShadRadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import type { ComponentRendererProps, ActionPlan } from "@/packages/engine/types";
import type { ReactNode } from "react";

export const RadioGroup = defineComponent({
  name: "RadioGroup",
  description: "A group of radio buttons. value=$var tracks the selected option.",
  props: z.object({
    options:  z.array(z.string()),
    value:    z.string(),
    label:    z.string().optional(),
    action:   z.unknown().optional(),
    stateKey: z.string().optional(),
  }),
  component: ({ props, triggerAction }: ComponentRendererProps): ReactNode => {
    if (!Array.isArray(props["options"])) return null;
    const stateKey = props["stateKey"] as string | undefined;

    function handleChange(val: string) {
      if (props["action"]) {
        triggerAction(props["action"] as ActionPlan);
      } else if (stateKey) {
        triggerAction({
          steps: [{ type: "set", target: stateKey, valueAST: { k: "Str", value: val } }],
        });
      }
    }

    return (
      <div className="flex flex-col gap-2">
        {props["label"] ? (
          <label className="text-sm font-medium">{props["label"] as string}</label>
        ) : null}
        <ShadRadioGroup value={(props["value"] as string | null) ?? ""} onValueChange={handleChange}>
          {(props["options"] as string[]).map((opt) => (
            <div key={opt} className="flex items-center gap-2">
              <RadioGroupItem value={opt} id={opt} />
              <label htmlFor={opt} className="text-sm">{opt}</label>
            </div>
          ))}
        </ShadRadioGroup>
      </div>
    );
  },
});
