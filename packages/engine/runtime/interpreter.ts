import type { ActionPlan, ASTNode, BinOpNode, CompNode, ElementNode, LibrarySchema } from "../types";

export interface InterpreterContext {
  /** Current store snapshot — "llm.<name>" keys for LLM-set $variables. */
  storeSnapshot: Record<string, unknown>;
  /** All resolved statement nodes — used to look up Refs inside dynamic expressions. */
  resolvedNodes: Record<string, ElementNode>;
  /** Variables injected by @Each — scoped to the current template evaluation. */
  localScope?: Record<string, unknown>;
  /** Maps positional args to named props when building components at eval time. */
  library?: LibrarySchema;
}

// Evaluates an AST node to a concrete runtime value using the current context.
// node may be undefined: mid-stream autoclose can leave a builtin call with
// missing arguments (e.g. `@Each(filtered` -> `@Each(filtered)`), so a missing
// node evaluates to null rather than throwing — the subtree renders blank until
// the next streaming chunk completes it.
export function evalAST(node: ASTNode | undefined, ctx: InterpreterContext): unknown {
  if (node == null) return null;
  switch (node.k) {
    case "Str": {
      // Interpolate $varName patterns from current state
      if (!node.value.includes("$")) return node.value;
      return node.value.replace(/\$([a-zA-Z_][a-zA-Z0-9_]*)/g, (full, name: string) => {
        const val = ctx.storeSnapshot[`llm.${name}`];
        return val != null ? String(val) : full;
      });
    }
    case "Num":      return node.value;
    case "Bool":     return node.value;
    case "Null":     return null;

    case "StateRef":
      return ctx.storeSnapshot[`llm.${node.name}`] ?? null;

    case "Ref": {
      if (ctx.localScope && node.name in ctx.localScope) {
        return ctx.localScope[node.name];
      }
      const resolved = ctx.resolvedNodes[node.name];
      if (!resolved) return null;
      // @-builtins stored in resolvedNodes are data operations (Filter, Sort, etc.).
      // Re-evaluate with current state to produce the plain value they represent.
      if (resolved.typeName.startsWith("@")) {
        return evalBuiltinElement(resolved, ctx);
      }
      // __Value__ wraps non-component RHS expressions (literals, arrays, objects,
      // ternaries, member access, etc.). Unwrap and evaluate the inner AST so a
      // Ref to a Ternary returns the chosen branch, not the wrapper element.
      if (resolved.typeName === "__Value__") {
        const inner = resolved.props["value"];
        if (inner !== null && typeof inner === "object" && typeof (inner as Record<string, unknown>)["k"] === "string") {
          return evalAST(inner as ASTNode, ctx);
        }
        return inner;
      }
      return resolved;
    }

    case "BinOp":    return evalBinOp(node, ctx);
    case "UnaryOp":  return evalUnaryOp(node, ctx);

    case "Ternary": {
      const cond = evalAST(node.cond, ctx);
      return evalAST(cond ? node.then : node.else, ctx);
    }

    case "Member": {
      const obj = evalAST(node.object, ctx);
      if (Array.isArray(obj)) {
        // Array pluck: arr.field → arr.map(item => item.field)
        return obj.map((item) =>
          item != null && typeof item === "object"
            ? (item as Record<string, unknown>)[node.property] ?? null
            : null
        );
      }
      if (obj != null && typeof obj === "object") {
        return (obj as Record<string, unknown>)[node.property] ?? null;
      }
      return null;
    }

    case "Index": {
      const arr = evalAST(node.object, ctx);
      const idx = evalAST(node.index, ctx);
      if (Array.isArray(arr) && typeof idx === "number") return arr[idx] ?? null;
      return null;
    }

    case "Arr":
      return node.items.map((item) => evalAST(item, ctx));

    case "Obj": {
      const obj: Record<string, unknown> = {};
      for (const { key, value } of node.entries) {
        obj[key] = evalAST(value, ctx);
      }
      return obj;
    }

    case "Comp":
      if (node.name.startsWith("@")) return evalBuiltin(node, ctx);
      return evalComponent(node, ctx);

    case "Assign":
      return evalAST(node.value, ctx);

    default:
      return null;
  }
}

// Recursively evaluates all dynamic props in an ElementNode tree.
export function evaluateTree(node: ElementNode, ctx: InterpreterContext): ElementNode {
  if (!node.hasDynamicProps) return validateElement(node, ctx);

  const props: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node.props)) {
    props[key] = evaluateValue(value, ctx);
  }

  return validateElement({ ...node, props, hasDynamicProps: false }, ctx);
}

function validateElement(
  node: ElementNode,
  ctx: InterpreterContext
): ElementNode {
  if (
    !ctx.library ||
    node.typeName.startsWith("__") ||
    node.typeName.startsWith("@")
  ) {
    return node;
  }

  const validation = ctx.library.validateProps(node.typeName, node.props);
  if (validation.success) {
    return { ...node, props: validation.data };
  }

  return {
    type: "element",
    typeName: "__Error__",
    props: {},
    partial: false,
    hasDynamicProps: false,
    statementId: node.statementId,
  };
}

// Evaluates a single prop value — handles ASTNodes, ElementNodes, and arrays.
function evaluateValue(value: unknown, ctx: InterpreterContext): unknown {
  if (value === null || typeof value !== "object") return value;

  if (Array.isArray(value)) {
    return value.map((item) => evaluateValue(item, ctx));
  }

  const obj = value as Record<string, unknown>;

  // ASTNode — evaluate it
  if (typeof obj["k"] === "string") {
    return evalAST(value as ASTNode, ctx);
  }

  // ElementNode — recurse into its props
  if (obj["type"] === "element") {
    return evaluateTree(value as ElementNode, ctx);
  }

  // Plain object
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    result[k] = evaluateValue(v, ctx);
  }
  return result;
}

// ── Operators ────────────────────────────────────────────────────────────────

function evalBinOp(node: BinOpNode, ctx: InterpreterContext): unknown {
  const l = evalAST(node.left, ctx);
  const r = evalAST(node.right, ctx);

  switch (node.op) {
    case "+":
      if (typeof l === "string" || typeof r === "string") {
        return (l ?? "") + "" + (r ?? "");
      }
      return (l as number) + (r as number);
    case "-":   return (l as number) - (r as number);
    case "*":   return (l as number) * (r as number);
    case "/": {
      const divisor = r as number;
      return divisor === 0 ? 0 : (l as number) / divisor;
    }
    case "%":   return (l as number) % (r as number);
    case "==":  return l == r;   // loose equality as per blueprint
    case "!=":  return l != r;
    case ">":   return (l as number) > (r as number);
    case "<":   return (l as number) < (r as number);
    case ">=":  return (l as number) >= (r as number);
    case "<=":  return (l as number) <= (r as number);
    case "&&":  return l && r;
    case "||":  return l || r;
    case "??":  return l ?? r;
    default:    return null;
  }
}

function evalUnaryOp(node: { k: "UnaryOp"; op: string; operand: ASTNode }, ctx: InterpreterContext): unknown {
  const v = evalAST(node.operand, ctx);
  if (node.op === "!") return !v;
  if (node.op === "-") return -(v as number);
  return null;
}

// ── Builtins ─────────────────────────────────────────────────────────────────

// Single source of truth for @Filter comparisons, shared by both filter paths.
// "contains" is case-insensitive; ==/!= are loose (per blueprint); >,<,>=,<= are numeric.
function matchesFilter(fieldValue: unknown, op: string, value: unknown): boolean {
  switch (op) {
    case "==":       return fieldValue == value;
    case "!=":       return fieldValue != value;
    case "contains": return String(fieldValue ?? "").toLowerCase().includes(String(value ?? "").toLowerCase());
    case ">":        return (fieldValue as number) >  (value as number);
    case "<":        return (fieldValue as number) <  (value as number);
    case ">=":       return (fieldValue as number) >= (value as number);
    case "<=":       return (fieldValue as number) <= (value as number);
    default:         return false;
  }
}

// Evaluates a @-builtin ElementNode (e.g. resolvedNodes["filtered"] = @Filter{...})
// by re-running the operation with the current runtime state.
// The ElementNode was built by the resolver with args stored as arg0, arg1, ...
function evalBuiltinElement(el: ElementNode, ctx: InterpreterContext): unknown {
  const argKeys = Object.keys(el.props)
    .filter((k) => /^arg\d+$/.test(k))
    .sort((a, b) => parseInt(a.slice(3)) - parseInt(b.slice(3)));
  const args = argKeys.map((k) => evaluateValue(el.props[k]!, ctx));
  const name = el.typeName.slice(1); // strip "@"

  switch (name) {
    case "Filter": {
      const [arr, field, op, value] = args as [unknown[], string, string, unknown];
      if (!Array.isArray(arr)) return [];
      return arr.filter((item) => matchesFilter((item as Record<string, unknown>)[field], op, value));
    }
    case "Sort": {
      const [arr, field, dir = "asc"] = args as [unknown[], string, string];
      if (!Array.isArray(arr)) return [];
      return [...arr].sort((a, b) => {
        const av = String((a as Record<string, unknown>)[field] ?? "");
        const bv = String((b as Record<string, unknown>)[field] ?? "");
        return dir === "desc" ? bv.localeCompare(av) : av.localeCompare(bv);
      });
    }
    case "Count": {
      const [arr] = args as [unknown[]];
      return Array.isArray(arr) ? arr.length : 0;
    }
    case "Sum": {
      const [arr, field] = args as [unknown[], string | undefined];
      if (!Array.isArray(arr)) return 0;
      return arr.reduce((acc: number, item) => {
        const v = field ? (item as Record<string, unknown>)[field] : item;
        return acc + (typeof v === "number" ? v : 0);
      }, 0);
    }
    case "Max": {
      const [arr, field] = args as [unknown[], string | undefined];
      if (!Array.isArray(arr) || arr.length === 0) return null;
      const vals = arr.map((item) => (field ? (item as Record<string, unknown>)[field] : item)) as number[];
      return Math.max(...vals);
    }
    case "Min": {
      const [arr, field] = args as [unknown[], string | undefined];
      if (!Array.isArray(arr) || arr.length === 0) return null;
      const vals = arr.map((item) => (field ? (item as Record<string, unknown>)[field] : item)) as number[];
      return Math.min(...vals);
    }
    default: return null;
  }
}

// Builds a concrete ElementNode from a component encountered mid-evaluation
// (e.g. a Tag(...) cell inside a dynamic @Each template, or a ternary branch).
// Positional args map to named props via the library, mirroring the resolver;
// every arg is evaluated against the current scope so loop vars resolve to values.
function evalComponent(node: CompNode, ctx: InterpreterContext): ElementNode {
  const params = ctx.library?.getParams(node.name) ?? [];
  const props: Record<string, unknown> = {};

  node.positional.forEach((arg, i) => {
    const key = params[i]?.name ?? `arg${i}`;
    props[key] = evalAST(arg, ctx);
  });
  for (const [argName, argNode] of Object.entries(node.named)) {
    props[argName] = evalAST(argNode, ctx);
  }
  for (const param of params) {
    if (!(param.name in props) && param.defaultValue !== undefined) {
      props[param.name] = param.defaultValue;
    }
  }

  return validateElement({
    type: "element",
    typeName: node.name,
    props,
    partial: false,
    hasDynamicProps: false,
    statementId: node.name,
  }, ctx);
}

function evalBuiltin(node: CompNode, ctx: InterpreterContext): unknown {
  const name = node.name.slice(1); // strip "@"

  switch (name) {
    case "Set": {
      const target = stateTarget(node.positional[0]);
      const valueAST = node.positional[1];
      if (!target || !valueAST) return null;
      return { steps: [{ type: "set", target, valueAST }] } satisfies ActionPlan;
    }

    case "Reset": {
      const targets = node.positional
        .map(stateTarget)
        .filter((target): target is string => Boolean(target));
      return { steps: [{ type: "reset", targets }] } satisfies ActionPlan;
    }

    case "OpenUrl": {
      const url = evalAST(node.positional[0]!, ctx);
      if (typeof url !== "string") return null;
      return { steps: [{ type: "open_url", url }] } satisfies ActionPlan;
    }

    case "SendMessage": {
      const message = evalAST(node.positional[0]!, ctx);
      if (typeof message !== "string") return null;
      return { steps: [{ type: "send_message", message }] } satisfies ActionPlan;
    }

    case "Actions": {
      const steps = node.positional.flatMap((action) => {
        const plan = evalAST(action, ctx) as ActionPlan | null;
        return plan?.steps ?? [];
      });
      return { steps } satisfies ActionPlan;
    }

    case "Count": {
      const arr = evalAST(node.positional[0]!, ctx);
      return Array.isArray(arr) ? arr.length : 0;
    }

    case "Filter": {
      const arr    = evalAST(node.positional[0]!, ctx) as unknown[];
      const field  = evalAST(node.positional[1]!, ctx) as string;
      const op     = evalAST(node.positional[2]!, ctx) as string;
      const value  = evalAST(node.positional[3]!, ctx);
      if (!Array.isArray(arr)) return [];
      return arr.filter((item) => matchesFilter((item as Record<string, unknown>)[field], op, value));
    }

    case "Sort": {
      const arr   = evalAST(node.positional[0]!, ctx) as unknown[];
      const field = evalAST(node.positional[1]!, ctx) as string;
      const dir   = (node.positional[2] ? evalAST(node.positional[2], ctx) : "asc") as string;
      if (!Array.isArray(arr)) return [];
      return [...arr].sort((a, b) => {
        const av = String((a as Record<string, unknown>)[field] ?? "");
        const bv = String((b as Record<string, unknown>)[field] ?? "");
        const cmp = av.localeCompare(bv);
        return dir === "desc" ? -cmp : cmp;
      });
    }

    case "Each": {
      const arr     = evalAST(node.positional[0]!, ctx) as unknown[];
      const varName = evalAST(node.positional[1]!, ctx) as string;
      const tplAST  = node.positional[2]!; // raw AST — evaluated per-item with variable injected
      if (!Array.isArray(arr)) return [];
      return arr.map((item) => {
        const itemCtx: InterpreterContext = {
          ...ctx,
          localScope: { ...(ctx.localScope ?? {}), [varName]: item },
        };
        return evalAST(tplAST, itemCtx);
      });
    }

    case "Sum": {
      const arr   = evalAST(node.positional[0]!, ctx) as unknown[];
      const field = node.positional[1] ? evalAST(node.positional[1], ctx) as string : null;
      if (!Array.isArray(arr)) return 0;
      return arr.reduce((acc: number, item) => {
        const v = field != null ? (item as Record<string, unknown>)[field] : item;
        return acc + (typeof v === "number" ? v : 0);
      }, 0);
    }

    case "Max": {
      const arr   = evalAST(node.positional[0]!, ctx) as unknown[];
      const field = node.positional[1] ? evalAST(node.positional[1], ctx) as string : null;
      if (!Array.isArray(arr) || arr.length === 0) return null;
      const vals = arr.map((item) =>
        field != null ? (item as Record<string, unknown>)[field] : item
      ) as number[];
      return Math.max(...vals);
    }

    case "Min": {
      const arr   = evalAST(node.positional[0]!, ctx) as unknown[];
      const field = node.positional[1] ? evalAST(node.positional[1], ctx) as string : null;
      if (!Array.isArray(arr) || arr.length === 0) return null;
      const vals = arr.map((item) =>
        field != null ? (item as Record<string, unknown>)[field] : item
      ) as number[];
      return Math.min(...vals);
    }

    default:
      return null;
  }
}

function stateTarget(node: ASTNode | undefined): string | null {
  return node?.k === "StateRef" ? node.name : null;
}
