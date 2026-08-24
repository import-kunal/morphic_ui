// Public API surface for packages/engine

export { MorphicEngine } from "./engine";
export type { MorphicEngineOptions } from "./engine";

export { defineComponent } from "./schema/component";
export type { DefinedComponent } from "./schema/component";

export { createLibrary } from "./schema/library";
export type { Library } from "./schema/library";

export { enrichErrors } from "./schema/validate";

export { buildSignature, zodTypeToString } from "./schema/prompt";

export { StreamParser } from "./parser/stream";
export { resolve, resolveFromASTMap, makeSimpleLibrary } from "./parser/resolver";
export { autoclose } from "./parser/autoclose";
export { tokenize } from "./parser/tokenizer";

export { Store } from "./runtime/state";
export { evalAST, evaluateTree } from "./runtime/interpreter";
export { executeActions } from "./runtime/actions";
export type { InterpreterContext } from "./runtime/interpreter";
export type { ActionCallback } from "./runtime/actions";

export type {
  ElementNode,
  ParseResult,
  MorphicError,
  ActionPlan,
  ActionStep,
  ASTNode,
  Token,
  Statement,
  LibrarySchema,
  ParamDef,
  ComponentRendererProps,
  RenderNode,
} from "./types";
