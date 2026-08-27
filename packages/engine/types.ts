// All shared types for MorphicUI engine. Every other file imports from here.

export interface Token {
  type: TokenType;
  value: string;
  pos: number;
}

export const enum TokenType {
  // Structure
  Newline,
  LParen,
  RParen,
  LBrack,
  RBrack,
  LBrace,
  RBrace,
  Comma,
  Colon,
  Equals,
  Dot,
  Question,

  // Literals
  Str,
  Num,
  True,
  False,
  Null,

  // Identifiers
  Ident,
  Type,      // PascalCase identifier → component name
  StateVar,  // $identifier
  BuiltinCall, // @PascalName

  // Operators
  Plus,
  Minus,
  Star,
  Slash,
  Percent,
  EqEq,
  BangEq,
  Gt,
  Lt,
  GtEq,
  LtEq,
  And,
  Or,
  Not,
  Coalesce, // ??

  EOF,
}

// AST node discriminated union — keyed by `k`
export type ASTNode =
  | CompNode
  | StrNode
  | NumNode
  | BoolNode
  | NullNode
  | ArrNode
  | ObjNode
  | RefNode
  | StateRefNode
  | BinOpNode
  | UnaryOpNode
  | TernaryNode
  | MemberNode
  | IndexNode
  | AssignNode
  | NamedArgNode;

export interface CompNode {
  k: "Comp";
  name: string;
  positional: ASTNode[];
  named: Record<string, ASTNode>;
}

export interface StrNode   { k: "Str";  value: string }
export interface NumNode   { k: "Num";  value: number }
export interface BoolNode  { k: "Bool"; value: boolean }
export interface NullNode  { k: "Null" }

export interface ArrNode   { k: "Arr";  items: ASTNode[] }
export interface ObjNode   { k: "Obj";  entries: Array<{ key: string; value: ASTNode }> }

export interface RefNode      { k: "Ref";      name: string }
export interface StateRefNode { k: "StateRef"; name: string }

export interface BinOpNode {
  k: "BinOp";
  op: string;
  left: ASTNode;
  right: ASTNode;
}

export interface UnaryOpNode {
  k: "UnaryOp";
  op: string;
  operand: ASTNode;
}

export interface TernaryNode {
  k: "Ternary";
  cond: ASTNode;
  then: ASTNode;
  else: ASTNode;
}

export interface MemberNode {
  k: "Member";
  object: ASTNode;
  property: string;
}

export interface IndexNode {
  k: "Index";
  object: ASTNode;
  index: ASTNode;
}

// $var = expr (two-way binding declaration)
export interface AssignNode {
  k: "Assign";
  name: string;
  value: ASTNode;
}

// Named argument in a component call (internal parse representation)
export interface NamedArgNode {
  k: "NamedArg";
  argName: string;
  value: ASTNode;
}

// A parsed statement: `identifier = expression`
export interface Statement {
  id: string;
  tokens: Token[];
}

// The resolved output of the resolver — what the React layer receives
export interface ElementNode {
  type: "element";
  typeName: string;
  props: Record<string, unknown>;
  partial: boolean;
  hasDynamicProps: boolean;
  statementId?: string;
}

// Result of a full parse cycle
export interface ParseResult {
  root: ElementNode | null;
  errors: MorphicError[];
  isPartial: boolean;
  /** All resolved statement nodes by name — used by the interpreter for Ref lookup. */
  resolvedNodes: Record<string, ElementNode>;
  /** Initial values declared as `$var = value` — pre-populate the store with these. */
  initialState: Record<string, unknown>;
}

// Props passed to every element component renderer
export type RenderNode = (value: unknown) => unknown; // React.ReactNode in renderer

export interface ComponentRendererProps<T = Record<string, unknown>> {
  props: T;
  renderNode: RenderNode;
  triggerAction: (plan: ActionPlan) => void;
  statementId?: string;
}

// Structured errors with LLM-actionable hints
export interface MorphicError {
  code:
    | "unknown-component"
    | "missing-required-prop"
    | "invalid-prop"
    | "excess-args"
    | "positional-after-named"
    | "scope-violation"
    | "cycle-detected"
    | "runtime-error";
  statementId?: string;
  message: string;
  hint: string;
}

// Action steps executed sequentially on user interaction
export type ActionStep =
  | { type: "set";          target: string; valueAST: ASTNode }
  | { type: "reset";        targets: string[] }
  | { type: "open_url";     url: string }
  | { type: "send_message"; message: string };

export interface ActionPlan {
  steps: ActionStep[];
}

// Parameter definition used by the resolver for arg mapping
export interface ParamDef {
  name: string;
  required: boolean;
  defaultValue?: unknown;
}

export interface PropValidationIssue {
  path: string;
  message: string;
}

export type PropValidationResult =
  | { success: true; data: Record<string, unknown> }
  | { success: false; issues: PropValidationIssue[] };

// Library schema exposed to the resolver
export interface LibrarySchema {
  getParams(componentName: string): ParamDef[] | undefined;
  hasComponent(name: string): boolean;
  componentNames(): string[];
  validateProps(
    componentName: string,
    props: Record<string, unknown>
  ): PropValidationResult;
}
