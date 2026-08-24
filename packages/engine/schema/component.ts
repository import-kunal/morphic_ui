import type { ZodObject, ZodRawShape, ZodTypeAny } from "zod";
import type { ComponentRendererProps } from "../types";

// WeakMap tags a Zod object schema with its component name.
// Used by prompt.ts to look up names when building signatures.
const schemaRegistry = new WeakMap<ZodObject<ZodRawShape>, string>();

export function getComponentName(schema: ZodObject<ZodRawShape>): string | undefined {
  return schemaRegistry.get(schema);
}

export interface DefinedComponent<
  TProps = Record<string, unknown>,
  TRenderer = (props: ComponentRendererProps<TProps>) => unknown
> {
  name: string;
  props: ZodObject<ZodRawShape>;
  description: string;
  component: TRenderer;
  // Use in parent component schemas: z.array(MyComponent.ref)
  ref: ZodTypeAny;
}

export function defineComponent<
  TShape extends ZodRawShape,
  TRenderer = (props: ComponentRendererProps<{ [K in keyof TShape]: unknown }>) => unknown
>(opts: {
  name: string;
  props: ZodObject<TShape>;
  description: string;
  component: TRenderer;
}): DefinedComponent<{ [K in keyof TShape]: unknown }, TRenderer> {
  schemaRegistry.set(opts.props, opts.name);
  return {
    name: opts.name,
    props: opts.props,
    description: opts.description,
    component: opts.component,
    ref: opts.props,
  };
}
