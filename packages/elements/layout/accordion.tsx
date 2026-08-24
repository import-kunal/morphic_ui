
import { z } from "zod";
import { defineComponent } from "@/packages/engine";
import {
  Accordion as ShadAccordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import type { ComponentRendererProps } from "@/packages/engine/types";
import type { ReactNode } from "react";

export const Accordion = defineComponent({
  name: "Accordion",
  description: "Collapsible accordion. items[] are { title, content } objects.",
  props: z.object({
    items: z.array(z.object({ title: z.string(), content: z.string() })),
    type:  z.enum(["single", "multiple"]).optional().default("single"),
  }),
  component: ({ props }: ComponentRendererProps): ReactNode => {
    const items = props["items"] as { title: string; content: string }[] | null;
    const type  = (props["type"] as "single" | "multiple") ?? "single";

    if (!Array.isArray(items)) return null;

    return (
      <ShadAccordion type={type as "single"} collapsible={type === "single"}>
        {items.map((item, i) => (
          <AccordionItem key={i} value={`item-${i}`}>
            <AccordionTrigger>{item.title}</AccordionTrigger>
            <AccordionContent>{item.content}</AccordionContent>
          </AccordionItem>
        ))}
      </ShadAccordion>
    );
  },
});
