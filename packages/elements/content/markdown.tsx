
import { z } from "zod";
import { defineComponent } from "@/packages/engine";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize from "rehype-sanitize";
import type { ComponentRendererProps } from "@/packages/engine/types";
import type { ReactNode } from "react";

export const Markdown = defineComponent({
  name: "Markdown",
  description: "Renders GitHub-flavored markdown safely. Use for rich text, explanations, and lists.",
  props: z.object({
    content: z.string(),
  }),
  component: ({ props }: ComponentRendererProps): ReactNode => {
    return (
      <div className="prose prose-sm dark:prose-invert max-w-none">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          rehypePlugins={[rehypeSanitize]}
        >
          {props["content"] as string}
        </ReactMarkdown>
      </div>
    );
  },
});
