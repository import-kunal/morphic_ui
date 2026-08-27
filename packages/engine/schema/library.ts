import type { ZodTypeAny } from "zod";
import { ZodDefault, ZodOptional } from "zod";
import type { DefinedComponent } from "./component";
import type {
  LibrarySchema,
  ParamDef,
  PropValidationResult,
} from "../types";
import { generatePrompt } from "./prompt";

export interface Library {
  components: Record<string, DefinedComponent>;
  root: string;
  prompt(): string;
  toSchema(): LibrarySchema;
}

export function createLibrary(opts: {
  components: DefinedComponent[];
  root?: string;
}): Library {
  const components: Record<string, DefinedComponent> = {};
  for (const comp of opts.components) {
    components[comp.name] = comp;
  }

  const root = opts.root ?? "Stack";

  // Build ParamMap: component name → ordered ParamDef[].
  // Key order of the Zod shape defines positional arg order.
  const paramMap = new Map<string, ParamDef[]>();
  for (const comp of opts.components) {
    // NOTE: .shape is a prototype getter that Turbopack can lose; _def.shape() is the owned source
    const shape = comp.props._def.shape();
    const params: ParamDef[] = [];
    for (const [key, fieldSchema] of Object.entries(shape)) {
      params.push(makeParamDef(key, fieldSchema as ZodTypeAny));
    }
    paramMap.set(comp.name, params);
  }

  const schema: LibrarySchema = {
    getParams(name)       { return paramMap.get(name); },
    hasComponent(name)    { return name in components; },
    componentNames()      { return Object.keys(components); },
    validateProps(name, props): PropValidationResult {
      const component = components[name];
      if (!component) {
        return {
          success: false,
          issues: [{ path: "", message: `Unknown component '${name}'.` }],
        };
      }

      const result = component.props.safeParse(props);
      if (result.success) {
        return {
          success: true,
          data: result.data as Record<string, unknown>,
        };
      }

      return {
        success: false,
        issues: result.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      };
    },
  };

  return {
    components,
    root,
    prompt()    { return generatePrompt(components, root); },
    toSchema()  { return schema; },
  };
}

function makeParamDef(name: string, schema: ZodTypeAny): ParamDef {
  const isOptional = schema.isOptional();

  let defaultValue: unknown;
  if (schema instanceof ZodDefault) {
    defaultValue = schema._def.defaultValue();
  } else if (schema instanceof ZodOptional && schema.unwrap() instanceof ZodDefault) {
    defaultValue = (schema.unwrap() as ZodDefault<ZodTypeAny>)._def.defaultValue();
  }

  return { name, required: !isOptional, defaultValue };
}
