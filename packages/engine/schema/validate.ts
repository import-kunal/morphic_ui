import type { MorphicError, LibrarySchema } from "../types";
import type { Library } from "./library";

// Enriches resolver errors with more actionable hints using library context.
export function enrichErrors(
  errors: MorphicError[],
  library: Library | LibrarySchema
): MorphicError[] {
  const schema = "toSchema" in library ? library.toSchema() : library;
  return errors.map((err) => enrichOne(err, schema));
}

function enrichOne(err: MorphicError, schema: LibrarySchema): MorphicError {
  switch (err.code) {
    case "unknown-component": {
      const available = schema.componentNames().join(", ");
      const name = extractQuotedName(err.message) ?? "?";
      return {
        ...err,
        hint: `Unknown component '${name}'. Available: ${available}`,
      };
    }

    case "missing-required-prop": {
      const propMatch = err.message.match(/prop '([^']+)' for '([^']+)'/);
      if (!propMatch) return err;
      const [, prop, comp] = propMatch;
      const params = schema.getParams(comp!) ?? [];
      const sig = `${comp}(${params.map((p) => p.name + (p.required ? "" : "?")).join(", ")})`;
      return {
        ...err,
        hint: `Missing required '${prop}'. Signature: ${sig}`,
      };
    }

    case "excess-args": {
      const match = err.message.match(/for '([^']+)'/);
      if (!match) return err;
      const [, comp] = match;
      const params = schema.getParams(comp!) ?? [];
      const sig = `${comp}(${params.map((p) => p.name + (p.required ? "" : "?")).join(", ")})`;
      return {
        ...err,
        hint: `Too many arguments. Signature: ${sig}`,
      };
    }

    case "positional-after-named": {
      const comp = extractQuotedName(err.message) ?? "component";
      return {
        ...err,
        hint: `In '${comp}': move all positional args before any named args.`,
      };
    }

    case "cycle-detected": {
      const name = extractQuotedName(err.message) ?? "?";
      return {
        ...err,
        hint: `'${name}' references itself directly or indirectly. Break the cycle.`,
      };
    }

    default:
      return err;
  }
}

function extractQuotedName(message: string): string | undefined {
  return message.match(/'([^']+)'/)?.[1];
}
