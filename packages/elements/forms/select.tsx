import { z } from "zod";
import { defineComponent } from "@/packages/engine";
import {
  Select as ShadSelect,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ComponentRendererProps, ActionPlan } from "@/packages/engine/types";
import { useId, type ReactNode } from "react";

export const Select = defineComponent({
  name: "Select",
  description: "A dropdown select bound to a $variable. options[] are the choices.",
  props: z.object({
    options:  z.array(z.string()),
    value:    z.string(),
    label:    z.string().optional(),
    action:   z.unknown().optional(),
    stateKey: z.string().optional(),
  }),
  component: function SelectComponent({ props, triggerAction }: ComponentRendererProps): ReactNode {
    const selectId = useId();
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
      <div className="flex flex-col gap-1.5">
        {props["label"] ? (
          <label htmlFor={selectId} className="text-sm font-medium">{props["label"] as string}</label>
        ) : null}
        <ShadSelect value={(props["value"] as string | null) ?? ""} onValueChange={handleChange}>
          <SelectTrigger id={selectId}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(props["options"] as string[]).map((opt) => (
              <SelectItem key={opt} value={opt}>{opt}</SelectItem>
            ))}
          </SelectContent>
        </ShadSelect>
      </div>
    );
  },
});
