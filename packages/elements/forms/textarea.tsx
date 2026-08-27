import { z } from "zod";
import { defineComponent } from "@/packages/engine";
import { Textarea as ShadTextarea } from "@/components/ui/textarea";
import type { ComponentRendererProps } from "@/packages/engine/types";
import { useId, type ReactNode } from "react";

export const Textarea = defineComponent({
  name: "Textarea",
  description: "A multi-line text input bound to a $variable.",
  props: z.object({
    value:       z.string(),
    label:       z.string().optional(),
    placeholder: z.string().optional(),
    stateKey:    z.string().optional(),
    rows:        z.number().optional().default(4),
  }),
  component: function TextareaComponent({ props, triggerAction }: ComponentRendererProps): ReactNode {
    const textareaId = useId();
    const stateKey = props["stateKey"] as string | undefined;

    function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
      if (stateKey) {
        triggerAction({
          steps: [{ type: "set", target: stateKey, valueAST: { k: "Str", value: e.target.value } }],
        });
      }
    }

    return (
      <div className="flex flex-col gap-1.5">
        {props["label"] ? (
          <label htmlFor={textareaId} className="text-sm font-medium">{props["label"] as string}</label>
        ) : null}
        <ShadTextarea
          id={textareaId}
          value={(props["value"] as string | null) ?? ""}
          placeholder={(props["placeholder"] as string) ?? ""}
          rows={(props["rows"] as number) ?? 4}
          onChange={handleChange}
        />
      </div>
    );
  },
});
