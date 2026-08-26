import { tokenize } from "./tokenizer";
import { splitStatements } from "./splitter";
import { parseStatement } from "./grammar";
import type {
  ASTNode,
  CompNode,
  ElementNode,
  MorphicError,
  ParseResult,
  LibrarySchema,
  Statement,
} from "../types";

const MAX_DEPTH = 50;

// Dynamic AST node kinds that must be preserved for the interpreter
const DYNAMIC_KINDS = new Set(["StateRef", "BinOp", "UnaryOp", "Ternary", "Member", "Index", "Assign"]);

// Sentinel — returned by tryEvalWithLocalScope when a node cannot be fully resolved
const UNRESOLVED: unique symbol = Symbol("unresolved");

// Evaluates a dynamic AST node using only localScope values (no runtime state).
// Returns UNRESOLVED if any part requires runtime state (StateRef, unknown Ref).
// Used so that @Each loop variables inside BinOp/Ternary etc. are fully inlined
// at parse time rather than falling back to null at runtime.
function tryEvalWithLocalScope(node: ASTNode, localScope: Record<string, unknown>): unknown {
  switch (node.k) {
    case "Str":  return node.value; // $var interpolation is a runtime concern only
    case "Num":  return node.value;
    case "Bool": return node.value;
    case "Null": return null;
    case "StateRef": return UNRESOLVED;
    case "Ref":
      return Object.prototype.hasOwnProperty.call(localScope, node.name)
        ? localScope[node.name]
        : UNRESOLVED;
    case "Member": {
      const obj = tryEvalWithLocalScope(node.object, localScope);
      if (obj === UNRESOLVED) return UNRESOLVED;
      if (obj != null && typeof obj === "object" && !Array.isArray(obj)) {
        return (obj as Record<string, unknown>)[node.property] ?? null;
      }
      return null;
    }
    case "BinOp": {
      const l = tryEvalWithLocalScope(node.left, localScope);
      const r = tryEvalWithLocalScope(node.right, localScope);
      if (l === UNRESOLVED || r === UNRESOLVED) return UNRESOLVED;
      switch (node.op) {
        case "+":
          return (typeof l === "string" || typeof r === "string")
            ? (l ?? "") + "" + (r ?? "")
            : (l as number) + (r as number);
        case "-":  return (l as number) - (r as number);
        case "*":  return (l as number) * (r as number);
        case "/":  return (r as number) === 0 ? 0 : (l as number) / (r as number);
        case "||": return l || r;
        case "&&": return l && r;
        case "??": return l ?? r;
        case "==": return l == r;
        case "!=": return l != r;
        case ">":  return (l as number) > (r as number);
        case "<":  return (l as number) < (r as number);
        case ">=": return (l as number) >= (r as number);
        case "<=": return (l as number) <= (r as number);
        default:   return UNRESOLVED;
      }
    }
    case "UnaryOp": {
      const v = tryEvalWithLocalScope(node.operand, localScope);
      if (v === UNRESOLVED) return UNRESOLVED;
      if (node.op === "!") return !v;
      if (node.op === "-") return -(v as number);
      return UNRESOLVED;
    }
    case "Ternary": {
      const cond = tryEvalWithLocalScope(node.cond, localScope);
      if (cond === UNRESOLVED) return UNRESOLVED;
      return tryEvalWithLocalScope(cond ? node.then : node.else, localScope);
    }
    default:
      return UNRESOLVED;
  }
}

const STR_INTERP_RE = /\$[a-zA-Z_][a-zA-Z0-9_]*/;

function isDynamic(node: ASTNode): boolean {
  if (DYNAMIC_KINDS.has(node.k)) return true;
  // String literals containing $varName are treated as templates — dynamic at runtime
  if (node.k === "Str" && STR_INTERP_RE.test(node.value)) return true;
  if (node.k === "Comp") {
    return node.positional.some(isDynamic) || Object.values(node.named).some(isDynamic);
  }
  if (node.k === "Arr") return node.items.some(isDynamic);
  if (node.k === "Obj") return node.entries.some((e) => isDynamic(e.value));
  return false;
}

// Like isDynamic, but also chases through Ref nodes into the symbol table.
// Used to detect whether @Each's source array transitively depends on runtime state.
function isDeepDynamic(
  node: ASTNode,
  symbolTable: Record<string, { ast: ASTNode; stmt: Statement }>,
  seen = new Set<string>()
): boolean {
  if (isDynamic(node)) return true;
  if (node.k === "Ref") {
    if (seen.has(node.name)) return false; // cycle guard
    const entry = symbolTable[node.name];
    if (!entry) return false;
    seen.add(node.name);
    return isDeepDynamic(entry.ast, symbolTable, seen);
  }
  if (node.k === "Comp") {
    return node.positional.some((a) => isDeepDynamic(a, symbolTable, seen)) ||
      Object.values(node.named).some((v) => isDeepDynamic(v, symbolTable, seen));
  }
  if (node.k === "Arr") return node.items.some((a) => isDeepDynamic(a, symbolTable, seen));
  if (node.k === "Obj") return node.entries.some((e) => isDeepDynamic(e.value, symbolTable, seen));
  return false;
}

// Checks if a RESOLVED value (post-resolveArgValue) still contains an ASTNode.
// A resolved Ref to a dynamic expression (e.g. a Ternary) returns the AST itself,
// so the parent component's hasDynamicProps must be true.
function resolvedHasDynamic(value: unknown): boolean {
  if (value === null || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some(resolvedHasDynamic);
  const obj = value as Record<string, unknown>;
  if (typeof obj["k"] === "string") return true; // it's an ASTNode
  if (obj["type"] === "element") {
    return Object.values((obj as unknown as ElementNode).props).some(resolvedHasDynamic);
  }
  return Object.values(obj).some(resolvedHasDynamic);
}

export interface ResolverContext {
  /** Named library schema for param mapping. If null, skips arg→prop mapping. */
  library: LibrarySchema | null;
  /** Statement names that are still streaming — their nodes get partial: true. */
  pendingStatements?: Set<string>;
}

export function resolve(source: string, ctx: ResolverContext): ParseResult {
  const tokens = tokenize(source);
  const statements = splitStatements(tokens);
  return resolveStatements(statements, ctx);
}

export function resolveStatements(statements: Statement[], ctx: ResolverContext): ParseResult {
  const errors: MorphicError[] = [];
  const initialState: Record<string, unknown> = {};

  // Build symbol table: name → ASTNode (from parsing).
  // $var declarations are extracted as initialState and excluded from the component table.
  const symbolTable: Record<string, { ast: ASTNode; stmt: Statement }> = {};
  for (const stmt of statements) {
    const parsed = parseStatement(stmt);
    if (parsed.errors.length > 0) {
      for (const e of parsed.errors) {
        errors.push({
          code: "runtime-error",
          statementId: stmt.id,
          message: e.message,
          hint: "Check MorphicLang syntax.",
        });
      }
    }
    if (parsed.expr && parsed.name) {
      if (parsed.name.startsWith("$")) {
        // State variable initial value — extract and skip component table
        initialState[parsed.name.slice(1)] = astToValue(parsed.expr);
      } else {
        symbolTable[parsed.name] = { ast: parsed.expr, stmt };
      }
    }
  }

  const rootEntry = symbolTable["root"];
  if (!rootEntry) {
    return { root: null, errors, isPartial: false, resolvedNodes: {}, initialState };
  }

  // Resolve root
  const visiting = new Set<string>();
  const root: ElementNode = resolveNode(rootEntry.ast, "root", symbolTable, visiting, errors, ctx, 0);

  // Resolve every named statement for the interpreter's resolvedNodes map
  const resolvedNodes: Record<string, ElementNode> = { root };
  for (const [name, entry] of Object.entries(symbolTable)) {
    if (name === "root") continue;
    const v = new Set<string>();
    try {
      resolvedNodes[name] = resolveNode(entry.ast, name, symbolTable, v, [], ctx, 0);
    } catch {
      // skip — error already recorded from root resolution
    }
  }

  return { root, errors, isPartial: root.partial, resolvedNodes, initialState };
}

function resolveNode(
  node: ASTNode,
  statementId: string,
  symbolTable: Record<string, { ast: ASTNode; stmt: Statement }>,
  visiting: Set<string>,
  errors: MorphicError[],
  ctx: ResolverContext,
  depth: number
): ElementNode {
  if (depth > MAX_DEPTH) {
    errors.push({
      code: "runtime-error",
      statementId,
      message: "Max recursion depth exceeded",
      hint: "Reduce nesting depth.",
    });
    return makePartialNode("__Error__", statementId);
  }

  switch (node.k) {
    case "Comp":
      return resolveComp(node, statementId, symbolTable, visiting, errors, ctx, depth);

    case "Ref": {
      const entry = symbolTable[node.name];
      if (!entry) {
        // Unresolved reference — return placeholder (streaming: may arrive later)
        return makePartialNode("__Unresolved__", node.name);
      }
      if (visiting.has(node.name)) {
        errors.push({
          code: "cycle-detected",
          statementId,
          message: `Cycle detected: '${node.name}'`,
          hint: `Remove the circular reference involving '${node.name}'.`,
        });
        return makePartialNode("__Error__", statementId);
      }
      visiting.add(node.name);
      const result = resolveNode(entry.ast, node.name, symbolTable, visiting, errors, ctx, depth + 1);
      visiting.delete(node.name);
      return result;
    }

    default:
      // Literal / state ref / etc. — wrap as a value node
      return {
        type: "element",
        typeName: "__Value__",
        props: { value: astToValue(node) },
        partial: false,
        hasDynamicProps: isDynamic(node),
        statementId,
      };
  }
}

function resolveComp(
  node: CompNode,
  statementId: string,
  symbolTable: Record<string, { ast: ASTNode; stmt: Statement }>,
  visiting: Set<string>,
  errors: MorphicError[],
  ctx: ResolverContext,
  depth: number,
  localScope?: Record<string, unknown>
): ElementNode {
  const { name, positional, named } = node;

  // Validate component exists if library provided
  if (ctx.library && !ctx.library.hasComponent(name) && !name.startsWith("@")) {
    errors.push({
      code: "unknown-component",
      statementId,
      message: `Unknown component '${name}'`,
      hint: `Available: ${ctx.library.componentNames().join(", ")}`,
    });
    return makePartialNode("__Error__", statementId);
  }

  // Map positional + named args → named props
  const props: Record<string, unknown> = {};
  let hasDynamic = false;

  if (ctx.library && !name.startsWith("@")) {
    const params = ctx.library.getParams(name) ?? [];

    // Map positional args by index
    for (let i = 0; i < positional.length; i++) {
      const param = params[i];
      if (!param) {
        errors.push({
          code: "excess-args",
          statementId,
          message: `Too many positional args for '${name}': got ${positional.length}, expected ≤${params.length}`,
          hint: `Signature: ${name}(${params.map((p) => p.name + (p.required ? "" : "?")).join(", ")})`,
        });
        break;
      }
      const resolved = resolveArgValue(positional[i]!, symbolTable, visiting, errors, ctx, statementId, depth, localScope);
      if (isDynamic(positional[i]!) || resolvedHasDynamic(resolved)) hasDynamic = true;
      props[param.name] = resolved;
    }

    // Map named args
    for (const [argName, argNode] of Object.entries(named)) {
      const resolved = resolveArgValue(argNode, symbolTable, visiting, errors, ctx, statementId, depth, localScope);
      if (isDynamic(argNode) || resolvedHasDynamic(resolved)) hasDynamic = true;
      props[argName] = resolved;
    }

    // Fill defaults and validate required
    for (const param of params) {
      if (!(param.name in props)) {
        if (param.required) {
          errors.push({
            code: "missing-required-prop",
            statementId,
            message: `Missing required prop '${param.name}' for '${name}'`,
            hint: `Provide '${param.name}' as a positional or named argument.`,
          });
        } else if (param.defaultValue !== undefined) {
          props[param.name] = param.defaultValue;
        }
      }
    }

  } else {
    // No library — pass through args as-is
    for (let i = 0; i < positional.length; i++) {
      const resolved = resolveArgValue(positional[i]!, symbolTable, visiting, errors, ctx, statementId, depth, localScope);
      if (isDynamic(positional[i]!) || resolvedHasDynamic(resolved)) hasDynamic = true;
      props[`arg${i}`] = resolved;
    }
    for (const [k, v] of Object.entries(named)) {
      const resolved = resolveArgValue(v, symbolTable, visiting, errors, ctx, statementId, depth, localScope);
      if (isDynamic(v) || resolvedHasDynamic(resolved)) hasDynamic = true;
      props[k] = resolved;
    }
  }

  return {
    type: "element",
    typeName: name,
    props,
    partial: ctx.pendingStatements?.has(statementId) ?? false,
    hasDynamicProps: hasDynamic,
    statementId,
  };
}

// Resolves an arg: if it's a Ref pointing to a component, resolves recursively to ElementNode;
// otherwise converts to a plain JS value (or preserves AST for dynamic nodes).
// localScope carries loop variables from @Each so d.name / d.image etc. resolve concretely.
function resolveArgValue(
  node: ASTNode,
  symbolTable: Record<string, { ast: ASTNode; stmt: Statement }>,
  visiting: Set<string>,
  errors: MorphicError[],
  ctx: ResolverContext,
  statementId: string,
  depth: number,
  localScope?: Record<string, unknown>
): unknown {
  // Loop variables from @Each take priority over the symbol table.
  if (node.k === "Ref") {
    if (localScope && Object.prototype.hasOwnProperty.call(localScope, node.name)) {
      return localScope[node.name];
    }
    const entry = symbolTable[node.name];
    if (!entry) return null; // unresolved (streaming)
    if (visiting.has(node.name)) {
      errors.push({
        code: "cycle-detected",
        statementId,
        message: `Cycle: '${node.name}'`,
        hint: `Remove circular reference involving '${node.name}'.`,
      });
      return null;
    }
    visiting.add(node.name);
    const result = resolveArgValue(entry.ast, symbolTable, visiting, errors, ctx, node.name, depth + 1, localScope);
    visiting.delete(node.name);
    return result;
  }

  // Member access on a loop variable — resolve to the concrete field value immediately,
  // bypassing the isDynamic check so the result is a plain string/number, not an AST node.
  if (node.k === "Member" && localScope) {
    const obj = node.object;
    if (obj.k === "Ref" && Object.prototype.hasOwnProperty.call(localScope, obj.name)) {
      const scopeVal = localScope[obj.name] as Record<string, unknown> | null;
      return scopeVal != null ? (scopeVal[node.property] ?? null) : null;
    }
  }

  // @-builtins in VALUE position (Filter, Sort, Sum, etc.) — not visual components.
  // Preserve as raw AST so the interpreter evaluates them at render time.
  // @Each is handled separately below.
  if (node.k === "Comp" && node.name.startsWith("@") && node.name !== "@Each") {
    return node;
  }

  // @Each — expand eagerly at resolve time using a per-item local scope.
  // Each item in the array gets its own scope with the loop variable bound to the item.
  // Returns an array; the Arr handler spreads it into the parent sibling list.
  // If the array source is state-dependent, defer the whole @Each to the interpreter.
  if (node.k === "Comp" && node.name === "@Each") {
    const arrArg = node.positional[0]!;

    // If the source is transitively dynamic (e.g. @Filter with a $stateVar),
    // we cannot expand at resolve time — hand the node to the interpreter intact.
    if (isDeepDynamic(arrArg, symbolTable)) {
      return node;
    }

    const arrVal = resolveArgValue(arrArg, symbolTable, new Set(visiting), errors, ctx, statementId, depth + 1, localScope);
    const varName = node.positional[1] ? (astToValue(node.positional[1]) as string) : null;
    const tpl = node.positional[2];

    // If source still didn't resolve to a plain array (e.g. static @Sort),
    // also defer to interpreter rather than silently returning [].
    if (!Array.isArray(arrVal)) return node;
    if (!varName || !tpl) return [];

    return arrVal.map((item, i) => {
      const scope = { ...(localScope ?? {}), [varName]: item };
      return resolveArgValue(tpl, symbolTable, new Set(visiting), errors, ctx, `${statementId}:${i}`, depth + 1, scope);
    });
  }

  if (node.k === "Comp") {
    return resolveComp(node, statementId, symbolTable, visiting, errors, ctx, depth + 1, localScope);
  }

  // Only spread @Each results into the parent — not all inner arrays.
  // Blindly calling .flat() would collapse genuine nested arrays (e.g. Table rows).
  // We spread when the item is a direct @Each call OR a Ref to a statement whose
  // RHS is @Each (e.g. movieGallery = @Each(...) referenced in Stack children).
  if (node.k === "Arr") {
    const result: unknown[] = [];
    for (const item of node.items) {
      const resolved = resolveArgValue(item, symbolTable, visiting, errors, ctx, statementId, depth + 1, localScope);
      const isEachSource =
        (item.k === "Comp" && item.name === "@Each") ||
        (item.k === "Ref" && isEachStatement(item.name, symbolTable, localScope));
      if (isEachSource && Array.isArray(resolved)) {
        result.push(...resolved);
      } else {
        result.push(resolved);
      }
    }
    return result;
  }

  if (node.k === "Obj") {
    const obj: Record<string, unknown> = {};
    for (const { key, value } of node.entries) {
      obj[key] = resolveArgValue(value, symbolTable, visiting, errors, ctx, statementId, depth + 1, localScope);
    }
    return obj;
  }

  // A ternary inside an @Each template whose condition resolves from the loop
  // scope: pick the branch and resolve it now. Branches are often components
  // (row.status == "x" ? Tag(...) : Tag(...)); resolving them here yields real
  // ElementNodes instead of raw AST that loses the loop binding after expansion.
  if (node.k === "Ternary" && localScope) {
    const cond = tryEvalWithLocalScope(node.cond, localScope);
    if (cond !== UNRESOLVED) {
      const branch = cond ? node.then : node.else;
      return resolveArgValue(branch, symbolTable, visiting, errors, ctx, statementId, depth + 1, localScope);
    }
  }

  // Dynamic nodes: try to evaluate using localScope first (handles @Each loop variables
  // inside BinOp/Ternary like "Gross: " + d.gross). Fall back to preserving AST for
  // nodes that reference runtime state (StateRef) or unknown symbols.
  if (isDynamic(node)) {
    if (localScope) {
      const result = tryEvalWithLocalScope(node, localScope);
      if (result !== UNRESOLVED) return result;
    }
    return node;
  }

  return astToValue(node);
}

function astToValue(node: ASTNode): unknown {
  switch (node.k) {
    case "Str":  return node.value;
    case "Num":  return node.value;
    case "Bool": return node.value;
    case "Null": return null;
    default:     return node; // preserve for interpreter
  }
}

// Returns true when a named symbol resolves to an @Each builtin call,
// meaning its expanded result should be spread into the parent sibling list.
function isEachStatement(
  name: string,
  symbolTable: Record<string, { ast: ASTNode; stmt: Statement }>,
  localScope?: Record<string, unknown>
): boolean {
  if (localScope && Object.prototype.hasOwnProperty.call(localScope, name)) return false;
  const entry = symbolTable[name];
  return entry !== undefined && entry.ast.k === "Comp" && entry.ast.name === "@Each";
}

function makePartialNode(typeName: string, statementId: string): ElementNode {
  return {
    type: "element",
    typeName,
    props: {},
    partial: true,
    hasDynamicProps: false,
    statementId,
  };
}

// --- Entry point for StreamParser: resolve from a pre-parsed AST map ---

export function resolveFromASTMap(
  astMap: Record<string, ASTNode>,
  ctx: ResolverContext
): ParseResult {
  const errors: MorphicError[] = [];
  const isPartial = (ctx.pendingStatements?.size ?? 0) > 0;

  // Extract $var declarations as initialState; exclude them from the component table.
  // Mirrors resolveStatements — without this, StateRef defaults (e.g. $category = "All")
  // are lost on the streaming path, so conditions like `$category == "All"` evaluate
  // against null and silently take the wrong ternary branch.
  type SymEntry = { ast: ASTNode; stmt: Statement };
  const symbolTable: Record<string, SymEntry> = {};
  const initialState: Record<string, unknown> = {};
  for (const [name, ast] of Object.entries(astMap)) {
    if (name.startsWith("$")) {
      initialState[name.slice(1)] = astToValue(ast);
    } else {
      symbolTable[name] = { ast, stmt: { id: name, tokens: [] } };
    }
  }

  const rootAst = astMap["root"];
  if (!rootAst) {
    return { root: null, errors, isPartial, resolvedNodes: {}, initialState };
  }

  const visiting = new Set<string>();
  const root = resolveNode(rootAst, "root", symbolTable, visiting, errors, ctx, 0);

  const resolvedNodes: Record<string, ElementNode> = { root };
  for (const [name, entry] of Object.entries(symbolTable)) {
    if (name === "root") continue;
    const v = new Set<string>();
    try {
      resolvedNodes[name] = resolveNode(entry.ast, name, symbolTable, v, [], ctx, 0);
    } catch { /* skip */ }
  }

  return { root, errors, isPartial, resolvedNodes, initialState };
}

// --- Convenience: resolve with a simple name→paramDef mock library ---

export interface SimpleComponentDef {
  params: Array<{ name: string; required: boolean; defaultValue?: unknown }>;
}

export function makeSimpleLibrary(
  defs: Record<string, SimpleComponentDef>
): LibrarySchema {
  return {
    getParams(name) { return defs[name]?.params; },
    hasComponent(name) { return name in defs; },
    componentNames() { return Object.keys(defs); },
  };
}
