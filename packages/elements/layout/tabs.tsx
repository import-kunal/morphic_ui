import { z } from "zod";
import { defineComponent } from "@/packages/engine";
import {
  Tabs as ShadTabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs";
import type { ComponentRendererProps, ActionPlan } from "@/packages/engine/types";
import type { ReactNode } from "react";

export const Tabs = defineComponent({
  name: "Tabs",
  description: "Tabbed navigation. labels[] are tab names, selected=$var tracks the active tab, stateKey= names the $var to update on click, children[] are the panels (one per label).",
  props: z.object({
    labels:   z.array(z.string()),
    selected: z.string(),
    children: z.array(z.unknown()).optional(),
    stateKey: z.string().optional(),
    action:   z.unknown().optional(),
  }),
  component: ({ props, renderNode, triggerAction }: ComponentRendererProps): ReactNode => {
    const labelsRaw = props["labels"] as string[] | null;
    if (!Array.isArray(labelsRaw) || labelsRaw.length === 0) return null;

    const labels   = labelsRaw;
    const selected = (props["selected"] as string | null) ?? labels[0] ?? "";
    const children = (props["children"] as unknown[] | null) ?? [];
    const stateKey = props["stateKey"] as string | undefined;
    const controlled = !!stateKey || !!props["action"];

    function handleChange(value: string) {
      if (props["action"]) {
        triggerAction(props["action"] as ActionPlan);
      } else if (stateKey) {
        triggerAction({
          steps: [{ type: "set", target: stateKey, valueAST: { k: "Str", value } }],
        });
      }
    }

    // Key on controlled/uncontrolled mode — when stateKey arrives mid-stream the
    // component remounts in controlled mode rather than switching mode on the same
    // instance (which Radix disallows and warns about).
    const modeKey = controlled ? `controlled:${stateKey ?? "action"}` : "uncontrolled";

    return (
      <ShadTabs
        key={modeKey}
        value={controlled ? selected : undefined}
        defaultValue={!controlled ? (selected || labels[0]) : undefined}
        onValueChange={handleChange}
      >
        <div className="overflow-x-auto overflow-y-hidden">
          <TabsList className="w-max min-w-full">
            {labels.map((label) => (
              <TabsTrigger key={label} value={label}>{label}</TabsTrigger>
            ))}
          </TabsList>
        </div>
        {labels.map((label, i) => (
          <TabsContent key={label} value={label}>
            {children[i] != null
              ? (renderNode(children[i]) as ReactNode)
              : <p className="text-xs text-zinc-500 py-4 text-center">Content unavailable</p>
            }
          </TabsContent>
        ))}
      </ShadTabs>
    );
  },
});
