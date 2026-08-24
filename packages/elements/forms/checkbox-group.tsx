import { z } from "zod";
import { defineComponent } from "@/packages/engine";
import { Checkbox } from "@/components/ui/checkbox";
import type { ComponentRendererProps } from "@/packages/engine/types";
import type { ReactNode } from "react";

export const CheckboxGroup = defineComponent({
  name: "CheckboxGroup",
  description: "A group of checkboxes. selected=$var holds the array of checked option strings.",
  props: z.object({
    options:  z.array(z.string()),
    selected: z.array(z.string()),
    label:    z.string().optional(),
    stateKey: z.string().optional(),
  }),
  component: ({ props, triggerAction }: ComponentRendererProps): ReactNode => {
    const optionsRaw  = props["options"]  as string[] | null;
    const selectedRaw = props["selected"] as string[] | null;
    const stateKey    = props["stateKey"] as string | undefined;

    if (!Array.isArray(optionsRaw) || !Array.isArray(selectedRaw)) return null;
    const options: string[]  = optionsRaw;
    const selected: string[] = selectedRaw;

    function handleToggle(opt: string, checked: boolean) {
      if (!stateKey) return;
      const next = checked
        ? [...selected, opt]
        : selected.filter((s) => s !== opt);
      triggerAction({
        steps: [{ type: "set", target: stateKey, valueAST: { k: "Arr", items: next.map((v) => ({ k: "Str", value: v })) } }],
      });
    }

    return (
      <div className="flex flex-col gap-2">
        {props["label"] ? (
          <label className="text-sm font-medium">{props["label"] as string}</label>
        ) : null}
        {options.map((opt) => (
          <div key={opt} className="flex items-center gap-2">
            <Checkbox
              id={opt}
              checked={selected.includes(opt)}
              onCheckedChange={(checked) => handleToggle(opt, checked === true)}
            />
            <label htmlFor={opt} className="text-sm">{opt}</label>
          </div>
        ))}
      </div>
    );
  },
});
