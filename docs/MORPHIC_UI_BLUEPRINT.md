# MorphicUI — Master Blueprint

> A next-generation Generative UI engine that converts streaming LLM output into live, interactive React interfaces powered by shadcn/ui components.

---

## 1. What Is MorphicUI?

MorphicUI is a **UI generation engine**. You give it a component library definition, it generates a system prompt, you send that to any LLM, and the LLM's streaming response is parsed and rendered as live interactive UI — in real-time, token by token.

```
Your Components (shadcn) → System Prompt → LLM streams text → MorphicUI Engine → Live React UI
```

### The Core Idea

Instead of the LLM returning JSON or HTML (which is verbose and hard to stream), the LLM writes in a compact DSL called **MorphicLang** — a custom language designed specifically for LLMs to generate UI efficiently.

```
root = Stack([header, chart, table])
header = TextContent("Q4 Revenue Dashboard", size="large")
chart = BarChart(["Oct", "Nov", "Dec"], [s1, s2], variant="grouped")
s1 = Series("Product A", [120, 150, 180])
s2 = Series("Product B", [90, 110, 140])
table = Table(cols, rows)
cols = [Col("Month"), Col("Revenue", type="number")]
rows = [["Oct", 120], ["Nov", 150], ["Dec", 180]]
```

This is **50-67% fewer tokens** than equivalent JSON, streams progressively, and renders as a full interactive dashboard with charts, tables, and buttons.

---

## 2. Response Mode Architecture — Text vs UI

This is the most important architectural decision in the system.

### The Problem

MorphicEngine uses a **1000+ token system prompt** (component signatures, DSL syntax rules, streaming instructions). For a Telegram bot answering "what's the weather?" or a simple conversational reply, this is pure waste. The LLM doesn't need to know what a `BarChart` is to say "It's 24°C in Mumbai."

At the same time, a web dashboard showing revenue data needs full MorphicLang rendering with charts, tables, and interactive filters.

These are **two fundamentally different pipelines** — not the same pipeline with a toggle:

```
Text Pipeline:
  User message → simple system prompt → LLM streams → raw markdown → client renders as text

UI Pipeline:
  User message → MorphicLang system prompt → LLM streams MorphicLang → MorphicEngine → ElementNode tree → React components
```

### The Decision: Two Explicit API Routes, Client Decides

```
POST /api/chat/text   →  plain markdown response   (Telegram, simple chat, API consumers)
POST /api/chat/ui     →  MorphicLang response       (web dashboards, rich interfaces)
```

The **caller decides which route to use** based on the source of the request. No detection magic, no ambiguity.

| Source / Context | Route | Why |
|-----------------|-------|-----|
| Telegram bot | `/api/chat/text` | Can't render React; markdown is the right format |
| Simple chat widget / Q&A | `/api/chat/text` | Conversational, no data visualisation needed |
| Web dashboard request | `/api/chat/ui` | User asked for structured data, needs charts/tables |
| Rich web app interface | `/api/chat/ui` | Full MorphicLang rendering |
| Third-party API consumer | `/api/chat/text` | They handle rendering themselves |

### Implementation

```typescript
// app/api/chat/text/route.ts — dead simple, no engine involved
export async function POST(req: Request) {
  const { messages } = await req.json();
  const result = streamText({
    model: openai("gpt-4o-mini"),
    system: "You are a helpful assistant. Respond in markdown.",
    messages,
  });
  return result.toDataStreamResponse();
}

// app/api/chat/ui/route.ts — full MorphicLang system prompt
export async function POST(req: Request) {
  const { messages } = await req.json();
  const result = streamText({
    model: openai("gpt-4o"),
    system: engine.generatePrompt(),   // 1000+ token MorphicLang prompt
    messages,
  });
  return result.toDataStreamResponse();
}
```

### For Web Chat With Mixed Responses (Same Conversation)

Some web apps need both in the same chat — simple questions answered as text, complex requests rendered as UI. For this case, always call `/api/chat/ui` from the web. A plain conversational reply is just:

```
root = TextContent("The concept works like this...")
```

The parser handles it, `TextContent` renders as styled text. The MorphicRenderer covers the full range: text replies are cheap (one statement), dashboards are rich (many statements). The cost is paying the system prompt on every call — acceptable for web UIs where quality matters.

**Rule of thumb:**
- Web app → always `/api/chat/ui`
- Non-web (Telegram, CLI, API) → always `/api/chat/text`
- Never mix routes within the same client context

### What MorphicRenderer Does NOT Handle

`MorphicRenderer` only accepts MorphicLang output from `/api/chat/ui`. It never receives raw markdown. If you use `/api/chat/text`, render the response with a plain markdown renderer (`react-markdown`) — not MorphicRenderer.

```tsx
// Web chat — always UI route, MorphicRenderer handles everything
{source === "web" && <MorphicRenderer engine={engine} response={response} />}

// Telegram / API — text route, plain markdown
{source === "telegram" && <ReactMarkdown>{response}</ReactMarkdown>}
```

---

## 3. How It Works — End to End

### Step 1: Define Components (Once, at Build Time)

```tsx
// packages/elements/layout/stack.tsx
import { defineComponent } from "@/packages/engine";
import { z } from "zod";
import { gap as gapTokens } from "@/lib/tokens";  // design token → Tailwind map

export const Stack = defineComponent({
  name: "Stack",
  props: z.object({
    children: z.array(z.any()),
    direction: z.enum(["row", "column"]).optional(),
    gap: z.enum(["none", "xs", "sm", "md", "lg", "xl"]).optional(),
  }),
  description: "Flex container with direction and gap",
  component: ({ props, renderNode }) => (
    <div className={cn(
      "flex",
      props.direction === "row" ? "flex-row" : "flex-col",
      gapTokens[props.gap ?? "none"],
    )}>
      {props.children?.map((child, i) => (
        <Fragment key={i}>{renderNode(child)}</Fragment>
      ))}
    </div>
  ),
});
```

Each component has:
- **`name`** — what the LLM writes in the DSL
- **`props`** — Zod schema (key order defines positional argument order)
- **`description`** — injected into system prompt
- **`component`** — the React renderer (wraps shadcn, uses design tokens for Tailwind classes)

### Step 2: Create a Library

```tsx
// packages/elements/library.ts
export const library = createLibrary({
  components: [Stack, Card, Button, BarChart, Table, TextContent, ...],
  root: "Stack",
});
```

### Step 3: Create the Engine (Once, at Module Level)

```tsx
// packages/engine-instance.ts
import { MorphicEngine } from "@/packages/engine";
import { library } from "@/packages/elements";

export const engine = new MorphicEngine({ library });
```

### Step 4: Call the Right LLM Route

```tsx
// Client decides the route
const route = isWebClient ? "/api/chat/ui" : "/api/chat/text";
const response = await fetch(route, { method: "POST", body: JSON.stringify({ messages }) });
```

### Step 5: Render

```tsx
// Web client — MorphicRenderer
<MorphicRenderer engine={engine} response={response} isStreaming={isStreaming} />

// Non-web / text route
<ReactMarkdown>{response}</ReactMarkdown>
```

**That's it.** The engine parses the streaming text, resolves references, maps arguments to props, evaluates expressions, and renders shadcn components — all in real-time as tokens arrive.

---

## 4. MorphicLang — The DSL

### Grammar

```
program     = statement*
statement   = identifier "=" expression NEWLINE
expression  = literal | component | array | object | reference | statevar | builtin | binop | ternary
component   = PascalName "(" args ")"
args        = positional_args ("," named_args)?
positional  = expression ("," expression)*
named       = identifier "=" expression ("," identifier "=" expression)*
literal     = STRING | NUMBER | BOOLEAN | NULL
reference   = lowercase_identifier
statevar    = "$" identifier
builtin     = "@" PascalName "(" args ")"
array       = "[" (expression ("," expression)*)? "]"
object      = "{" (key ":" expression ("," key ":" expression)*)? "}"
binop       = expression OPERATOR expression
ternary     = expression "?" expression ":" expression
member      = expression "." identifier
index       = expression "[" expression "]"
```

### Key Improvement Over OpenUI: Named Arguments

```
// OpenUI (positional only — confusing for LLMs):
Button("Submit", null, "primary", null, "large")

// MorphicLang (hybrid positional + named — unambiguous):
Button("Submit", variant="primary", size="large")
```

**Rules for named args (enforced at parse time):**
1. Positional args come first. Named args come after.
2. Once a named arg appears, all subsequent args must be named.
3. Named args can appear in any order among themselves.
4. `Button(variant="primary", "Submit")` is a **parse error** — positional after named.

**Resolver dual-lookup strategy:** Positional args are matched by index to the Zod schema key order. Named args are matched by name regardless of position. Missing required positional args produce a validation error; missing optional args use their schema default.

### Streaming Rules

1. Root statement first — UI skeleton appears immediately
2. References can be used before defined (hoisting) — they render as null until defined
3. Each statement on its own line — completed statements are cached and never re-parsed
4. Top-down order (structure → components → data) for optimal progressive rendering

### Reactive Features

```
$selectedTab = "overview"
$searchQuery = ""

root = Stack([tabs, content])
tabs = Tabs(["Overview", "Details"], selected=$selectedTab)
content = $selectedTab == "overview" ? overviewPanel : detailsPanel
filtered = @Filter(items, "name", "contains", $searchQuery)
```

### Builtin Functions

| Builtin | Signature | Returns |
|---------|-----------|---------|
| `@Count` | `@Count(arr)` | number |
| `@Filter` | `@Filter(arr, field, op, value)` | filtered array |
| `@Sort` | `@Sort(arr, field, dir?)` | sorted array |
| `@Each` | `@Each(arr, varName, template)` | mapped array |
| `@Sum` | `@Sum(arr, field?)` | number |
| `@Max` / `@Min` | `@Max(arr, field?)` | number |

**Critical `@Each` scoping rule:** The iterator variable (`varName`) is **only in scope inside the `template` argument**. The resolver temporarily injects the variable name during template resolution then removes it. Extracting the template to a separate statement breaks the scope and is a validation error.

```
// CORRECT — variable "item" scoped to template arg
list = @Each(users, "item", Card([Text(item.name), Text(item.email)]))

// WRONG — item is not defined outside @Each
itemCard = Card([Text(item.name)])   ← validation error: "item" is not in scope
list = @Each(users, "item", itemCard)
```

---

## 5. Architecture — Three Packages

```
packages/
├── engine/         ← Pure TypeScript, zero framework deps
├── renderer/       ← React adapter (thin bridge)
└── elements/       ← shadcn component wrappers
```

**Invariant**: `engine/` must never import from `renderer/` or `elements/`. If it does, it's a design failure. The engine is independently testable, runnable in Node.js, and reusable with any UI framework.

- **engine** — zero React deps. Works in Node.js, Cloudflare Workers, test runners.
- **renderer** — thin React bridge. Could be replaced with a Vue or Svelte adapter later.
- **elements** — swappable component set. Could use Material UI or Radix instead of shadcn.

---

## 6. Styling Layer — Design Tokens

All elements use a shared token → Tailwind class mapping from `lib/tokens.ts`. This ensures consistency, correct Tailwind purging (no runtime class construction), and a single place to change spacing/sizing across the library.

```typescript
// lib/tokens.ts
export const gap = {
  none: "",
  xs:   "gap-1",
  sm:   "gap-2",
  md:   "gap-4",
  lg:   "gap-6",
  xl:   "gap-8",
} as const;

export const padding = {
  none: "",
  xs:   "p-1",
  sm:   "p-2",
  md:   "p-4",
  lg:   "p-6",
  xl:   "p-8",
} as const;

export const textSize = {
  xs:   "text-xs",
  sm:   "text-sm",
  base: "text-base",
  lg:   "text-lg",
  xl:   "text-xl",
  "2xl": "text-2xl",
  "3xl": "text-3xl",
} as const;

export const fontWeight = {
  normal:   "font-normal",
  medium:   "font-medium",
  semibold: "font-semibold",
  bold:     "font-bold",
} as const;

export const radius = {
  none: "",
  sm:   "rounded-sm",
  md:   "rounded-md",
  lg:   "rounded-lg",
  full: "rounded-full",
} as const;
```

**Rule:** Every element that accepts a sizing/spacing/color prop must map it through `lib/tokens.ts`. Never build Tailwind class names with string interpolation (`gap-${value}`) — Tailwind cannot purge dynamically constructed class names.

---

## 7. Core Type Definitions

These types must be defined in `packages/engine/types.ts` before any other file is written. They are the contracts between every layer.

```typescript
// The rendered output of the resolver — what the React layer receives
interface ElementNode {
  type: "element";
  typeName: string;                       // "Stack", "Button", etc.
  props: Record<string, unknown>;         // May contain ASTNode values (dynamic props)
  partial: boolean;                       // True while streaming this node
  hasDynamicProps: boolean;               // False = skip interpreter, pure static
  statementId?: string;                  // Source statement name for debugging
}

// The result of each parse cycle
interface ParseResult {
  root: ElementNode | null;
  errors: MorphicError[];
  isPartial: boolean;                     // True if any statement is still streaming
}

// How components receive and render their children
type RenderNode = (value: unknown) => React.ReactNode;

// Props passed to every element component renderer
interface ComponentRendererProps<T = Record<string, unknown>> {
  props: T;
  renderNode: RenderNode;
  statementId?: string;
}

// Structured errors with LLM-actionable hints
interface MorphicError {
  code: "unknown-component" | "missing-required-prop" | "excess-args" |
        "positional-after-named" | "scope-violation" | "cycle-detected" | "runtime-error";
  statementId?: string;
  message: string;
  hint: string;                           // What the LLM should do differently
}

// Action steps executed sequentially on user interaction
type ActionStep =
  | { type: "set";   target: string; valueAST: ASTNode }
  | { type: "reset"; targets: string[] }
  | { type: "open_url"; url: string }
  | { type: "send_message"; message: string };

interface ActionPlan {
  steps: ActionStep[];
}
```

---

## 8. Project Structure — Complete File Map

```
morphic-ui/                              ← Next.js project root
│
├── app/                                 ← Next.js App Router
│   ├── layout.tsx                       ← Root layout with fonts, providers
│   ├── page.tsx                         ← Main chat/demo page
│   ├── globals.css                      ← Global styles + Tailwind base
│   └── api/
│       └── chat/
│           ├── text/
│           │   └── route.ts             ← Plain markdown endpoint (Telegram, simple chat)
│           └── ui/
│               └── route.ts             ← MorphicLang endpoint (web, rich UI)
│
├── components/                          ← App-level UI (not part of the engine)
│   ├── ui/                              ← shadcn base components (auto-generated by CLI)
│   │   ├── button.tsx
│   │   ├── card.tsx
│   │   ├── input.tsx
│   │   ├── tabs.tsx
│   │   ├── table.tsx
│   │   ├── select.tsx
│   │   ├── chart.tsx
│   │   ├── badge.tsx
│   │   ├── separator.tsx
│   │   ├── accordion.tsx
│   │   ├── slider.tsx
│   │   ├── checkbox.tsx
│   │   ├── radio-group.tsx
│   │   ├── switch.tsx
│   │   ├── textarea.tsx
│   │   ├── dialog.tsx
│   │   └── alert.tsx
│   └── chat/                            ← Chat shell UI
│       ├── ChatWindow.tsx               ← Message list, scrolls to latest
│       ├── MessageBubble.tsx            ← Renders one message (text or UI)
│       └── ChatInput.tsx                ← User input bar with send button
│
├── packages/                            ← THE MORPHIC ENGINE
│   │
│   ├── engine/                          ← Core engine (zero deps, pure TypeScript)
│   │   ├── parser/
│   │   │   ├── tokens.ts               ← const enum TokenType (~36 types, zero runtime cost)
│   │   │   ├── tokenizer.ts            ← Char scanner → Token[]. PascalCase=component,
│   │   │   │                              $prefix=statevar, @prefix=builtin. Streaming-safe.
│   │   │   ├── ast.ts                  ← AST node discriminated union (Comp, Str, Num, Bool,
│   │   │   │                              Null, Arr, Obj, Ref, StateRef, BinOp, UnaryOp,
│   │   │   │                              Ternary, Member, Index, Assign, NamedArg)
│   │   │   ├── splitter.ts             ← Token stream → Statement[]. Splits at depth-0
│   │   │   │                              newlines. Tracks ternary continuation. Multi-line
│   │   │   │                              ternaries not split.
│   │   │   ├── grammar.ts              ← Pratt parser: Statement.tokens → ASTNode.
│   │   │   │                              Precedence: ternary < OR < AND < equality <
│   │   │   │                              comparison < arithmetic < unary < member.
│   │   │   │                              Parses positional and named args. Enforces
│   │   │   │                              "positional before named" rule.
│   │   │   ├── resolver.ts             ← AST → ElementNode tree. Resolves refs (inlines),
│   │   │   │                              maps positional+named args → named props via schema,
│   │   │   │                              validates required props, applies defaults, preserves
│   │   │   │                              runtime AST (StateRef, BinOp) for the interpreter,
│   │   │   │                              handles @Each scope injection/removal.
│   │   │   ├── autoclose.ts            ← Patches incomplete syntax for streaming. Tracks
│   │   │   │                              bracket/string stack, appends missing ), ], }, ".
│   │   │   │                              Returns wasIncomplete flag.
│   │   │   └── stream.ts               ← StreamParser: maintains buffer, caches completed
│   │   │                                  statements (never re-parsed), re-parses only the
│   │   │                                  current pending statement on each chunk.
│   │   ├── runtime/
│   │   │   ├── interpreter.ts          ← Tree-walking AST evaluator. Resolves StateRef →
│   │   │   │                              store value, BinOp, UnaryOp, Ternary, Member access
│   │   │   │                              (array pluck), Index, @Each/@Filter/@Sort/@Count.
│   │   │   │                              Div-by-zero → 0. String + null → "".
│   │   │   ├── state.ts                ← Snapshot-based reactive store. get/set/subscribe/
│   │   │   │                              getSnapshot. useSyncExternalStore compatible.
│   │   │   │                              Shallow-compares snapshots to skip no-op updates.
│   │   │   └── actions.ts              ← Sequential action execution: @Set, @Reset, @OpenUrl,
│   │   │                                  @SendMessage. Halts on first failure.
│   │   ├── schema/
│   │   │   ├── component.ts            ← defineComponent(). Tags Zod schema with component
│   │   │   │                              name via WeakMap for cross-referencing in prompt.
│   │   │   ├── library.ts              ← createLibrary(). Builds ParamMap (name → ordered
│   │   │   │                              param list) from Zod key order. Exposes prompt(),
│   │   │   │                              toSchema(), components record.
│   │   │   ├── prompt.ts               ← Generates system prompt from component schemas.
│   │   │   │                              Auto-builds signatures: Card(children: Component[],
│   │   │   │                              title?: string). Includes syntax rules, @Each scoping
│   │   │   │                              warning, streaming order instructions, 2-3 examples.
│   │   │   └── validate.ts             ← Enriches MorphicErrors with actionable hints.
│   │   │                                  "Unknown component X — available: [list]".
│   │   │                                  "Wrong arg count — signature: Button(label, variant?)"
│   │   ├── types.ts                    ← All shared types: ElementNode, ParseResult, RenderNode,
│   │   │                                  ComponentRendererProps, MorphicError, ActionPlan,
│   │   │                                  ActionStep, Token, Statement, ASTNode.
│   │   ├── engine.ts                   ← MorphicEngine class. Public API surface.
│   │   │                                  new MorphicEngine({ library })
│   │   │                                  .generatePrompt() → string
│   │   │                                  .parse(text) → ParseResult
│   │   │                                  .createStreamParser() → StreamParser
│   │   │                                  .evaluate(result, storeSnapshot) → ElementNode tree
│   │   │                                  .dispose()
│   │   └── index.ts                    ← Public exports
│   │
│   ├── renderer/                        ← React adapter (depends on engine, not on elements)
│   │   ├── MorphicRenderer.tsx          ← Top-level component. Props: engine, response,
│   │   │                                  isStreaming, onError?, onAction?. Sets up provider,
│   │   │                                  renders root ElementNode, shows query loading states.
│   │   ├── MorphicProvider.tsx          ← React context. Holds: engine ref, library, renderNode
│   │   │                                  fn, triggerAction fn, isStreaming flag.
│   │   ├── RenderNode.tsx               ← Per-node renderer. Looks up component from library →
│   │   │                                  wraps in ErrorBoundary → passes evaluated props +
│   │   │                                  renderNode callback to component renderer.
│   │   ├── ErrorBoundary.tsx            ← Per-component isolation. On error: shows last valid
│   │   │                                  render (stored in ref). Auto-recovers when props
│   │   │                                  change and error clears.
│   │   ├── hooks/
│   │   │   ├── useMorphicState.ts       ← The core orchestration hook. Wires together:
│   │   │   │                              StreamParser (fed by response prop) → Store
│   │   │   │                              (useSyncExternalStore) → interpreter (evaluates
│   │   │   │                              dynamic props) → error collection → onError callback.
│   │   │   │                              Uses useMemo for parse+evaluate. Uses useEffect for
│   │   │   │                              post-stream side effects (future: query execution).
│   │   │   ├── useMorphic.ts            ← Context accessor. Returns { library, engine,
│   │   │   │                              isStreaming, errors }.
│   │   │   └── useTriggerAction.ts      ← Returns triggerAction(plan: ActionPlan) function.
│   │   │                                  Executes steps sequentially, updates store, fires
│   │   │                                  onAction callback for @SendMessage/@OpenUrl.
│   │   └── index.ts
│   │
│   └── elements/                        ← shadcn-based MorphicLang component wrappers
│       ├── layout/
│       │   ├── stack.tsx               ← Flex container. Props: children, direction, gap.
│       │   ├── card.tsx                ← shadcn Card. Props: children, title?, footer?, variant?.
│       │   ├── tabs.tsx                ← shadcn Tabs. Props: labels[], selected=$var, children[].
│       │   ├── accordion.tsx           ← shadcn Accordion. Props: items[{title, content}].
│       │   └── separator.tsx           ← shadcn Separator. Props: orientation?.
│       ├── content/
│       │   ├── text.tsx                ← Text block. Props: content, size?, weight?, color?.
│       │   ├── markdown.tsx            ← react-markdown renderer. Props: content.
│       │   │                              Sanitizes HTML. Uses remark-gfm for tables/code.
│       │   ├── image.tsx               ← Image display. Props: src, alt, width?, height?.
│       │   │                              SECURITY: validates src is http/https, no javascript:.
│       │   ├── code-block.tsx          ← Shiki syntax highlighting. Props: code, language?.
│       │   └── callout.tsx             ← shadcn Alert. Props: message, variant (info/warn/error).
│       ├── charts/
│       │   ├── bar-chart.tsx           ← Recharts BarChart. Props: categories[], series[], variant?.
│       │   ├── line-chart.tsx          ← Recharts LineChart. Props: categories[], series[].
│       │   ├── pie-chart.tsx           ← Recharts PieChart. Props: data[{label, value}], donut?.
│       │   ├── area-chart.tsx          ← Recharts AreaChart. Props: categories[], series[].
│       │   └── series.tsx              ← Data series definition. Props: name, data[].
│       ├── forms/
│       │   ├── input.tsx               ← shadcn Input. Props: label?, placeholder?, value=$var.
│       │   ├── textarea.tsx            ← shadcn Textarea. Props: label?, placeholder?, value=$var.
│       │   ├── select.tsx              ← shadcn Select. Props: options[], value=$var, label?.
│       │   ├── slider.tsx              ← shadcn Slider. Props: min, max, step?, value=$var.
│       │   ├── checkbox-group.tsx      ← Checkbox list. Props: options[], selected=$var.
│       │   └── radio-group.tsx         ← Radio list. Props: options[], selected=$var.
│       ├── actions/
│       │   ├── button.tsx              ← shadcn Button. Props: label, action?, variant?, size?.
│       │   └── button-group.tsx        ← Horizontal button row. Props: children[].
│       ├── data/
│       │   ├── table.tsx               ← shadcn Table. Props: columns[], rows[].
│       │   └── tag.tsx                 ← shadcn Badge. Props: label, variant?.
│       ├── library.ts                  ← createLibrary() wiring all elements together
│       └── index.ts
│
├── lib/
│   ├── tokens.ts                        ← Design token → Tailwind class maps (gap, padding,
│   │                                      text size, font weight, radius, colors)
│   └── utils.ts                         ← cn() helper, shared utilities
│
├── package.json
├── next.config.ts
├── tsconfig.json
├── tailwind.config.ts
├── components.json                      ← shadcn CLI config
└── MORPHIC_UI_BLUEPRINT.md
```

---

## 9. What Each File Does — Detailed

### 9.1 Engine — Parser Files

| File | Est. Lines | What It Does |
|------|-----------|--------------|
| `tokens.ts` | ~40 | `const enum TokenType` — 36+ types. Zero runtime cost (TypeScript inlines). Types: Newline, LParen/RParen, LBrack/RBrack, LBrace/RBrace, Comma, Colon, Equals, True/False/Null, EOF, Str, Num, Ident, Type (PascalCase), StateVar ($), Dot, operators (+−*/%), comparisons (==, !=, >, <, >=, <=), And/Or/Not, Question, BuiltinCall (@). |
| `tokenizer.ts` | ~220 | Single-pass character scanner. No regex. Detects PascalCase → `Type` token, `$` prefix → `StateVar`, `@` prefix → `BuiltinCall`. Streaming-safe string parsing: incomplete string (no closing quote) is auto-closed. Negative number disambiguation: checks previous token to distinguish unary minus from subtraction. |
| `ast.ts` | ~110 | AST node discriminated union keyed by `k` field: `Comp` (component call with positional[] and named{} args separated), `Str/Num/Bool/Null` (literals), `Arr/Obj` (collections), `Ref` (lowercase reference), `StateRef` ($var), `BinOp/UnaryOp` (operators), `Ternary`, `Member` (dot access), `Index` (bracket access), `Assign` ($var = expr for two-way binding). |
| `splitter.ts` | ~110 | Splits flat token array into `Statement[]` where each is `{ id: string, tokens: Token[] }`. Only splits on `Newline` tokens at bracket depth 0. Tracks ternary depth separately so `cond ?\n  val1 :\n  val2` is not split mid-ternary. |
| `grammar.ts` | ~400 | **Pratt parser.** Token array → ASTNode. Precedence table: Ternary(1) < OR(2) < AND(3) < Equality(4) < Comparison(5) < Addition(6) < Multiplication(7) < Unary(8) < Member/Index(9). `parsePrefix()` handles atoms, arrays, objects, state vars, components, builtins, grouped expressions, unary ops. `parseInfix()` handles binary ops, ternary, dot/index access. For components: collects positional args until first `ident =` pattern, then switches to named arg collection. Error on positional after named. |
| `resolver.ts` | ~320 | **The critical bridge.** Single-pass recursive traversal: (1) Resolves `Ref` nodes by looking up the statement symbol table — detects cycles. (2) For `Comp` nodes: fetches `ParamMap` from library schema, maps positional args by index, named args by name, validates required, applies defaults. (3) For `@Each`: temporarily injects iterator variable into scope during template arg resolution, then removes it. (4) Unknown components, missing required props, positional-after-named → `MorphicError`. (5) Preserves `StateRef`, `BinOp`, `Ternary` etc. as AST in `ElementNode.props` for the interpreter. |
| `autoclose.ts` | ~70 | Scans a partial token stream, tracks open bracket/string stack, appends the minimum closing characters (`)`, `]`, `}`, `"`) to make input syntactically valid. Returns `{ closed: string, wasIncomplete: boolean }`. Called on the pending statement before every parse attempt. |
| `stream.ts` | ~160 | `StreamParser` class. Maintains a text buffer split at `completedEnd` (all fully-streamed statements) and `pending` (current in-progress statement). `push(chunk)`: appends to buffer, calls `scanNewCompleted()` to promote finished statements, calls `autoclose()` on pending, runs full parse. Completed statements are cached in `Map<id, ElementNode>` and never re-parsed. Completed statements can never be overwritten by a partial pending statement. |

### 9.2 Engine — Runtime Files

| File | Est. Lines | What It Does |
|------|-----------|--------------|
| `interpreter.ts` | ~270 | Tree-walking evaluator. Takes an AST node + evaluation context → concrete value. `StateRef` → reads `context.getState(name)`. `BinOp(+)` with string operands → string concatenation (null → ""). `BinOp(/)` by zero → 0 (never Infinity/NaN). `==` uses loose equality. `Member` on array → plucks field from every element. `@Each(arr, var, template)` → maps array, substituting `var` in template. `@Filter/@Sort/@Count/@Sum/@Max/@Min` → inline array operations. |
| `state.ts` | ~100 | Snapshot-based reactive store (not signals — v1 choice). `get(name)`, `set(name, value)`, `getSnapshot() → Record<string,unknown>`, `subscribe(fn)`. Calls subscribers only when shallow comparison of new snapshot differs from old. Compatible with React's `useSyncExternalStore`. |
| `actions.ts` | ~110 | Executes an `ActionPlan` sequentially. `@Set($var, expr)` → evaluates expr at action-time using current store snapshot, calls `state.set()`. `@Reset($var)` → restores to declared initial value. `@OpenUrl(url)` → validates URL is http/https (never javascript:), fires `onAction` callback. `@SendMessage(msg)` → fires `onAction` callback for the host app to handle. Stops on first error. |

### 9.3 Engine — Schema Files

| File | Est. Lines | What It Does |
|------|-----------|--------------|
| `component.ts` | ~70 | `defineComponent({ name, props, description, component })`. Tags the Zod object schema with the component name via `WeakMap<ZodSchema, string>` for cross-referencing in prompt signature generation. Returns a `DefinedComponent<T, C>` with `.ref` property for use in parent schemas: `z.array(Button.ref)`. |
| `library.ts` | ~90 | `createLibrary({ components, root? })`. Builds `ParamMap: Map<name, { params: ParamDef[] }>` — the key order of each Zod object schema becomes the positional argument order. Exposes `prompt()` (returns full system prompt string), `toSchema()` (returns ParamMap for resolver), `components` (keyed record for renderer lookup). |
| `prompt.ts` | ~280 | Assembles the system prompt from components defined in the library. Sections: (1) Role preamble. (2) MorphicLang syntax rules (numbered, terse). (3) Component signatures auto-generated from Zod schemas. (4) Builtin function docs auto-generated from builtin registry. (5) `@Each` scoping warning with CORRECT/WRONG example. (6) Streaming order rules. (7) 2-3 complete program examples. (8) Self-check rules (verify arg count, named-after-positional, no invented components). |
| `validate.ts` | ~85 | `enrichErrors(errors, library)` — adds `hint` field to each `MorphicError`. "Unknown component `Chart` — available: BarChart, LineChart, PieChart." "Too many args for `Button(label, variant?, size?)` — got 5, expected ≤3." "Positional arg after named arg in `Card` at position 3." |

### 9.4 Engine — Top Level

| File | Est. Lines | What It Does |
|------|-----------|--------------|
| `types.ts` | ~90 | All shared types. `ElementNode`, `ParseResult`, `RenderNode`, `ComponentRendererProps`, `MorphicError`, `ActionPlan`, `ActionStep`, `Token`, `Statement`. **Must be written first — everything else depends on it.** |
| `engine.ts` | ~130 | `MorphicEngine` class — the one thing consumers import. Constructor: `new MorphicEngine({ library })`. Methods: `generatePrompt()`, `parse(text): ParseResult`, `createStreamParser(): StreamParser`, `evaluate(result, storeSnapshot): ElementNode tree`, `dispose()`. Wraps parser, state, and prompt generator with a clean lifecycle. |
| `index.ts` | ~30 | Barrel exports: `MorphicEngine`, `defineComponent`, `createLibrary`, all types. |

### 9.5 Renderer Files

| File | Est. Lines | What It Does |
|------|-----------|--------------|
| `MorphicRenderer.tsx` | ~90 | `<MorphicRenderer engine={} response={} isStreaming={} onError={} onAction={} />`. Top-level entry point. Creates `MorphicProvider` with engine+library context. Calls `useMorphicState` to get the evaluated root node. Renders root via `RenderNode`. |
| `MorphicProvider.tsx` | ~45 | React context provider. Value: `{ engine, library, renderNode, triggerAction, isStreaming }`. `renderNode` is the recursive render function passed to component renderers as a prop. |
| `RenderNode.tsx` | ~70 | Receives an `ElementNode`. Looks up `library.components[node.typeName]`. Wraps in `ErrorBoundary`. Calls `evaluateProps(node, storeSnapshot, interpreter)` if `node.hasDynamicProps`, else uses static props. Passes `{ props, renderNode, statementId }` to the component renderer. |
| `ErrorBoundary.tsx` | ~55 | Class component error boundary (required by React API). Stores last valid rendered children in `lastGoodRef`. On error: renders `lastGoodRef.current`. Resets error state when `node.statementId` prop changes (new valid node arrived). Prevents one broken component from crashing sibling nodes. |
| `useMorphicState.ts` | ~270 | **Core orchestration hook.** (1) `useMemo`: creates `StreamParser` from engine. (2) `useMemo`: calls `sp.set(response)` on every response change → `ParseResult`. (3) `useSyncExternalStore`: subscribes to `Store` for $variable changes. (4) `useMemo`: calls `engine.evaluate(result, storeSnapshot)` → evaluated tree. (5) `useEffect`: collects errors, fires `onError`. Uses `requestAnimationFrame` debouncing during fast streaming to avoid rendering every single token. |
| `useTriggerAction.ts` | ~60 | Returns `triggerAction(plan: ActionPlan)`. Executes plan via `actions.ts`, updates store, fires `onAction` prop for `@OpenUrl`/`@SendMessage` steps. |

### 9.6 Elements Pattern

Every element file follows this exact pattern:

```tsx
import { defineComponent } from "@/packages/engine";
import { z } from "zod";
import { ShadcnComponent } from "@/components/ui/shadcn-component";
import { gap, textSize } from "@/lib/tokens";
import { cn } from "@/lib/utils";

export const MyElement = defineComponent({
  name: "MyElement",
  props: z.object({
    // Required props first (positional), optional props after (named)
    label: z.string(),
    variant: z.enum(["default", "secondary"]).optional(),
    size: z.enum(["sm", "md", "lg"]).optional(),
  }),
  description: "One-line description for the LLM system prompt",
  component: ({ props, renderNode }) => (
    <ShadcnComponent
      variant={props.variant ?? "default"}
      className={cn(textSize[props.size ?? "md"])}
    >
      {props.label}
    </ShadcnComponent>
  ),
});
```

**Rule:** Required props always come first in the Zod schema — they become positional args. Optional props come after — they become named args. Never put an optional prop before a required one.

---

## 10. Security Constraints

These must be enforced from the start, not added later.

| Risk | Mitigation | Where |
|------|-----------|-------|
| XSS in markdown | `rehype-sanitize` on all `markdown.tsx` content | `elements/content/markdown.tsx` |
| `javascript:` URLs | Validate `src` and `url` props are `http://` or `https://` only | `elements/content/image.tsx`, `actions.ts` |
| Arbitrary code execution | Custom interpreter only — no `eval()`, no `new Function()` | `runtime/interpreter.ts` |
| Unknown components | `resolver.ts` drops them + records error — never reaches renderer | `resolver.ts` |
| Deep nesting DoS | Max recursion depth of 50 in `resolver.ts` and `RenderNode.tsx` | Both |
| State key collision | $variable names from LLM are namespaced under `"llm."` prefix in store | `state.ts` |

---

## 11. v1 Scope — What's In and What's Deferred

### In v1

- Full MorphicLang parser (positional + named args)
- Streaming with statement caching + autoclose
- Snapshot-based reactive store ($variables)
- Interpreter (BinOp, Ternary, Member, @Each, @Filter, @Sort, @Count)
- Actions (@Set, @Reset, @OpenUrl, @SendMessage)
- Schema-driven prompt generation from Zod
- All elements: layout, content, charts, forms, data, actions
- Two API routes (text + UI)
- Error boundaries with last-good-state recovery
- Design token → Tailwind styling layer

### Deferred to v2

| Feature | Why Deferred |
|---------|-------------|
| Query/Mutation data fetching | Requires tool call protocol design — scope on its own |
| Signal-based fine-grained reactivity | Overkill for v1; snapshot store is fine for ≤10 $vars |
| Edit mode (patch existing program) | Needs `merge.ts` + conversation history — Phase 2 feature |
| Multi-root outputs | Single root is sufficient for dashboards and forms |
| Visual editor (drag-and-drop) | Separate product, not the engine |
| Protocol versioning | Not needed until 3rd-party integrators exist |
| Animation primitives | Scope creep for v1 |

---

## 12. Build Order — Phase by Phase

### Phase 1: Types + Parser Foundation (Week 1–2)

Write `types.ts` first — every other file imports from it. Then build the parser bottom-up.

**Build order:** `types.ts` → `tokens.ts` → `tokenizer.ts` → `ast.ts` → `splitter.ts` → `grammar.ts` → `resolver.ts`

**Gate test:** Feed this string to the resolver:
```
root = Stack([header, content])
header = TextContent("Hello World", size="large")
content = Card([TextContent("Body text")])
```
Assert: `root.typeName === "Stack"`, `root.props.children` is an array of two `ElementNode`s, `header.props.content === "Hello World"`, `header.props.size === "large"`.

### Phase 2: Streaming (Week 2)

**Build order:** `autoclose.ts` → `stream.ts`

**Gate test:** Feed these chunks sequentially:
```
"root = Stack([hea"       → root.partial === true, autoclose added )]
"root = Stack([header"    → header ref unresolved (null), root.partial === true
"root = Stack([header])\n" → root complete, partial === false
"header = TextContent(\"Hi\")" → header resolves, root renders both
```

### Phase 3: Schema + Prompt (Week 2–3)

**Build order:** `component.ts` → `library.ts` → `prompt.ts` → `validate.ts` → `engine.ts`

**Gate test:** `library.prompt()` returns a string containing "Stack(children, direction?, gap?)" and the DSL syntax rules. Send the prompt to GPT-4o with "show me a dashboard" — get back valid MorphicLang.

### Phase 4: Runtime (Week 3–4)

**Build order:** `interpreter.ts` → `state.ts` → `actions.ts`

**Gate test:** Parse `content = $selectedTab == "overview" ? overviewPanel : detailsPanel` → set `$selectedTab = "overview"` in store → evaluate → returns `overviewPanel` node. Change to `"details"` → returns `detailsPanel` node.

### Phase 5: React Renderer (Week 4)

**Build order:** `MorphicProvider.tsx` → `ErrorBoundary.tsx` → `RenderNode.tsx` → `useMorphicState.ts` → `MorphicRenderer.tsx` → `useTriggerAction.ts`

**Gate test:** `<MorphicRenderer>` fed a hardcoded ParseResult renders the correct component tree. Updating the `response` prop with a new streaming chunk updates the UI without full remount.

### Phase 6: Elements (Week 4–5)

**Build order:** Start with the essentials: `tokens.ts` (lib) → `stack.tsx` → `card.tsx` → `text.tsx` → `button.tsx` → `table.tsx`. Then add: `markdown.tsx` → `tabs.tsx` → `bar-chart.tsx` → `line-chart.tsx`. Then: all forms → remaining charts → remaining layout → remaining content.

**Gate test:** LLM generates a dashboard with a BarChart, Table, and two Buttons. Renders with correct shadcn styling. Clicking a button triggers @Set action and re-renders dependent components.

### Phase 7: Next.js Integration + Demo (Week 5)

Wire up both API routes. Build the chat shell (`ChatWindow`, `MessageBubble`, `ChatInput`). `MessageBubble` checks the source route: if `/api/chat/ui`, renders `<MorphicRenderer>`; if `/api/chat/text`, renders `<ReactMarkdown>`.

**Gate test (end-to-end):** Type "show me Q4 revenue by product as a dashboard" → LLM streams MorphicLang → live dashboard builds token by token. Type "explain what GDP is" (via text route) → clean markdown response.

### Realistic Timeline

| Phase | Blueprint | Realistic |
|-------|-----------|----------|
| Phase 1: Parser | 1–2 weeks | 2 weeks (named args adds ~100 lines to resolver) |
| Phase 2: Streaming | ½ week | ½ week |
| Phase 3: Schema + Prompt | 1 week | 1 week |
| Phase 4: Runtime | 1 week | 1 week |
| Phase 5: Renderer | 1 week | 1 week |
| Phase 6: Elements | 1–1.5 weeks | 2 weeks (30 components × 60 lines) |
| Phase 7: Integration | ½ week | ½ week |
| **Total** | **5 weeks** | **8 weeks** |

---

## 13. Key Design Decisions

| Decision | Choice | Why |
|----------|--------|-----|
| DSL vs JSON | Custom DSL (MorphicLang) | 50-67% token savings, better streaming |
| Arg style | Hybrid positional + named | Positional-only (OpenUI) confuses LLMs on complex components |
| Response routing | Two explicit routes, caller decides | No detection magic; Telegram/API stay simple |
| Web fallback | Web always calls `/api/chat/ui` | TextContent handles plain replies; one code path |
| Component library | shadcn/ui + Recharts | Beautiful defaults, copy-paste ownership, Tailwind-native |
| Styling | Design tokens → Tailwind in `lib/tokens.ts` | No dynamic class construction, Tailwind purging works correctly |
| Reactivity | Snapshot store (v1) — not signals | Signals are overkill for ≤10 $vars; add in v2 if needed |
| Query/Mutation | Deferred to v2 | Scope isolation; requires tool call protocol design |
| Framework coupling | engine has zero React deps | Independently testable; Vue/Svelte adapters possible |
| Public API | Class-based `MorphicEngine` | Clean lifecycle, easy to instantiate and configure |
| Internal modules | Pure functions | Simpler, easier to test, no unnecessary OOP |
| Error handling | Structured errors with hints | Designed for LLM correction loops |
| Security | Allowlist + custom interpreter | No eval/Function; unknown components dropped, not rendered |

---

## 14. What Success Looks Like

```tsx
import { MorphicEngine } from "@/packages/engine";
import { MorphicRenderer } from "@/packages/renderer";
import { library } from "@/packages/elements";

const engine = new MorphicEngine({ library });

// For Telegram / API / simple chat:
fetch("/api/chat/text", { body: JSON.stringify({ messages }) })
  .then(res => streamToMarkdown(res));

// For web dashboard / rich UI:
fetch("/api/chat/ui", { body: JSON.stringify({ messages }) })
  .then(res => streamToResponse(res));

// Render:
<MorphicRenderer engine={engine} response={response} isStreaming={isStreaming} />
```

**Two routes. One renderer. Live generative UI.**
