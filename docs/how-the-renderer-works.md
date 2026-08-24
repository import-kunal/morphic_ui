# MorphicUI — How the Renderer Works

A complete technical walkthrough for the team. Start here if you want to understand
what happens between "user hits send" and "UI appears on screen."

---

## The Big Picture

MorphicUI is a generative UI engine. Instead of the LLM returning a static answer,
it returns **executable code** in a tiny custom language called MorphicLang. The engine
parses that code and renders it as live React components — in real-time, while it's
still streaming.

```
User types prompt
  ↓
POST /api/chat/ui
  ↓
Gemini generates MorphicLang text  (streaming, token by token)
  ↓
StreamParser parses it incrementally
  ↓
Resolver converts AST → ElementNode tree
  ↓
Interpreter evaluates dynamic props against runtime state
  ↓
React renders the tree using shadcn/ui components
```

Everything below expands each of those steps.

---

## Step 1 — The API route and the system prompt

**File:** `app/api/chat/ui/route.ts`

When the user sends a message, the browser POSTs to `/api/chat/ui`.
The route does two things before calling Gemini:

**1. Generates the system prompt.**
It calls `engine.generatePrompt()` which reads every registered component
(name, description, props schema) and produces a structured prompt that tells
Gemini exactly what MorphicLang looks like and what components are available.

```
You are a UI generation engine. Respond ONLY with a MorphicLang program.

## Available Components

### Stack(children: any[], direction?: "row"|"column", gap?: ...)
  Flex container for laying out children...

### Grid(children: any[], columns?: 1|2|3|4, gap?: ...)
  Responsive CSS grid for card galleries...

### LineChart(categories: string[], series: {...}[], height?: number)
  Line chart. categories[] are X-axis labels...

... (all registered components listed here)

## Streaming Order (IMPORTANT)
  Write `root` first — the UI skeleton appears immediately.
  Write children and data statements after.
```

**2. Streams the response back.**
Gemini's output is piped chunk-by-chunk to the browser as plain text.
If Gemini errors mid-stream, the route appends `\n\nError: <message>`
so the client can split the clean content from the error message.

---

## Step 2 — MorphicLang DSL

The LLM writes code in MorphicLang — a minimal expression language invented
specifically for this project. Every program is a list of named statements:

```
root = Stack([header, content], gap="lg")
header = Text("Monthly Revenue", size="2xl", weight="bold")
content = LineChart(months, series)
months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun"]
series = [{name: "Revenue", data: [42000, 53000, 48000, 61000, 55000, 72000]}]
```

**Rules:**
- Every statement: `name = Expression`
- `root` is the entry point — the renderer starts there
- Component call: `PascalCase(positional_arg, named_arg=value)`
- References: lowercase name refers to another statement (forward references allowed)
- State variables: `$name` — reactive values updated at runtime
- Built-in functions: `@Each`, `@Filter`, `@Sort`, `@Count`, `@Sum`, `@Max`, `@Min`

**Crucially: the LLM writes `root` first.**
The streaming order matters — `root` appears at the top of the output, so a skeleton
of the UI renders immediately, before the data arrays at the bottom are received.

---

## Step 3 — Streaming parser

**File:** `packages/engine/parser/stream.ts`

The browser receives the MorphicLang text as a stream of characters.
`StreamParser` maintains a growing buffer and processes it incrementally.

### How it tracks "completed" vs "pending" statements

A statement is **complete** when a newline arrives at bracket depth 0.
For example:

```
root = Stack([header, content])   ← newline at depth 0 → COMPLETED
header = Text(                    ← newline at depth 1 → still pending...
  "Hello",
  size="xl"
)                                 ← newline at depth 0 → COMPLETED
```

The parser scans character by character, tracking brackets and string literals.
Completed statements are tokenized, parsed into an AST, and **cached**. This is
important — completed statements are never re-parsed, even as the buffer grows.

### Handling the incomplete tail

The text currently being streamed (the "pending" statement) is not finished.
The autoclose module patches it with the minimum closing characters needed to
make it syntactically valid:

```
content = LineChart(["Jan", "Feb"    ← stream cut off here mid-array
                                     ↓ autoclose adds:
content = LineChart(["Jan", "Feb"])  ← now parseable
```

The resulting "partial" parse is marked with `partial: true` so the renderer
knows it's still incoming.

### Building a result every chunk

After each chunk arrives, `StreamParser.buildResult()`:
1. Takes all cached (completed) AST nodes
2. Parses the autoclosed pending tail
3. Runs the **resolver** over the combined AST map
4. Returns a `ParseResult`

The whole pipeline runs on every React render triggered by new streaming text.

---

## Step 4 — The resolver: AST → ElementNode tree

**File:** `packages/engine/parser/resolver.ts`

The resolver is the engine's core. It takes a map of `name → ASTNode` and
produces a fully resolved `ElementNode` tree that React can render.

### Symbol table and hoisting

All statements are loaded into a symbol table first, then `root` is resolved.
This is why forward references work — `root` can reference `chart` even though
`chart` appears after `root` in the source.

### Resolving a node

For each ASTNode the resolver encounters, it does one of these things:

| ASTNode type | What the resolver does |
|---|---|
| `Comp("Stack", ...)` | Creates an `ElementNode` with `typeName="Stack"`, maps args to props via the Zod schema |
| `Ref("header")` | Looks up "header" in the symbol table, resolves it recursively |
| `Arr([a, b, c])` | Resolves each item, handles `@Each` spreading |
| `Obj({key: val})` | Resolves each value |
| `Str("hello")` | Returns the string literal |
| `Num(42)` | Returns the number |
| `BinOp("+", left, right)` | **Dynamic** — preserved as AST for the interpreter |
| `StateRef("tab")` | **Dynamic** — preserved as AST for the interpreter |
| `Ternary(cond, t, f)` | **Dynamic** — preserved as AST for the interpreter |
| `Member(obj, "field")` | Dynamic unless the object is a loop variable (see @Each below) |

### Static vs dynamic split

This is the most important design decision in the engine.

**Static values** are resolved at parse time to plain JS values (strings, numbers,
arrays, objects, ElementNodes). The resolved `ElementNode.props` contains these
plain values directly.

**Dynamic values** (anything that depends on runtime state: `$tab`, `$query == "x"`,
`count > 0 ? "Yes" : "No"`) are left as AST nodes inside the props map. The parent
ElementNode gets `hasDynamicProps: true`. The **interpreter** evaluates them at render
time against the current state.

### @Each expansion

`@Each(arr, "item", template)` is expanded **eagerly** at resolve time.
For each item in `arr`, the resolver creates a `localScope = { item: <value> }`
and resolves the template with that scope. Member accesses like `item.name`,
BinOp expressions like `"Name: " + item.name`, and Ternaries using the loop
variable are all resolved to concrete values immediately. The result is a flat
array of ElementNodes.

```
@Each(movies, "movie", Card([Text(movie.title)]))
  ↓ resolver expands with localScope for each movie
[Card({children: [Text({content: "Avatar"})]}),
 Card({children: [Text({content: "Avengers: Endgame"})]}),
 ...]
```

### ElementNode

After resolution, every component becomes an `ElementNode`:

```ts
{
  type:           "element",
  typeName:       "Stack",           // component name
  props: {
    direction:    "row",             // static — resolved string
    children:     [ElementNode, ...], // static — nested tree
    gap:          "md",              // static — resolved string
    label:        BinOpAST,          // dynamic — preserved for interpreter
  },
  partial:        false,             // true while still streaming
  hasDynamicProps: true,             // true if any prop is an ASTNode
  statementId:    "root",
}
```

---

## Step 5 — The interpreter: evaluating dynamic props

**File:** `packages/engine/runtime/interpreter.ts`

The interpreter runs **after** the resolver. It walks the ElementNode tree and
evaluates any props that are still ASTNodes, replacing them with concrete values
using the current state snapshot.

```ts
// In MorphicRenderer:
const evaluatedRoot = engine.evaluate(parseResult, storeSnapshot);
```

This runs on every state change (when a `$var` is updated) and on every new
streaming chunk. Because it only touches nodes with `hasDynamicProps: true`,
it's fast — most of the tree is already concrete from the resolver.

### What it evaluates

```
$tab == "Overview"       → true or false (based on current store)
count > 0 ? "Yes" : "No" → "Yes" or "No"
"Hello, " + $name        → "Hello, Alice"
arr.length               → 3
```

---

## Step 6 — The reactive state store

**File:** `packages/engine/runtime/state.ts`

MorphicUI has a built-in reactive state store for `$variables`. It works like
a simplified Zustand, compatible with React's `useSyncExternalStore`.

```
$selectedTab = "Overview"   ← declared in MorphicLang, initial value loaded at parse time
```

When a Button or Tab triggers an action (user clicks something), the action
handler writes to the store. The store notifies React, which re-runs
`evaluate()` with the new snapshot, producing an updated element tree.
React re-renders only the components with changed props.

**Store keys use the `llm.` namespace** to avoid collisions with any future
app-level state: `"llm.selectedTab"`, `"llm.query"`, etc.

---

## Step 7 — The renderer

**Files:** `packages/renderer/MorphicRenderer.tsx`, `RenderNode.tsx`,
`hooks/useMorphicState.ts`

### `useMorphicState`

The React hook that wires everything together:

```ts
function useMorphicState({ engine, response }) {
  const sp = useMemo(() => engine.createStreamParser(), [engine]);

  // Re-runs on every chunk (response grows with each streaming token)
  const parseResult = useMemo(() => sp.set(response), [sp, response]);

  // Seed $var initial values from the parsed program
  useEffect(() => store.loadInitialState(parseResult.initialState), [...]);

  // Re-renders when any $variable changes (button click, tab switch, etc.)
  const storeSnapshot = useSyncExternalStore(subscribe, getSnapshot);

  // Evaluate dynamic props against current state
  const evaluatedRoot = useMemo(
    () => engine.evaluate(parseResult, storeSnapshot),
    [parseResult, storeSnapshot]
  );
}
```

### `MorphicRenderer`

The public component. Consumes `useMorphicState`, sets up the `renderNode` callback,
and renders the root node:

```tsx
<MorphicProvider engine={engine} library={...} renderNode={renderNode} triggerAction={triggerAction}>
  {evaluatedRoot ? <RenderNode node={evaluatedRoot} /> : null}
</MorphicProvider>
```

### `RenderNode`

Looks up the component definition by `typeName`, wraps it in an `ErrorBoundary`,
and calls the component's render function:

```tsx
const compDef = library.components[node.typeName];
renderer({ props: node.props, renderNode, triggerAction });
```

The `renderNode` callback is passed down to every component so they can render
their `children` prop (which contains ElementNodes, not React elements yet).

---

## Step 8 — Components (elements)

**Directory:** `packages/elements/`

Each component is defined with `defineComponent()`:

```ts
export const BarChart = defineComponent({
  name: "BarChart",
  description: "Bar chart. categories[] are X-axis labels, series[] are {name, data[]} objects.",
  props: z.object({
    categories: z.array(z.string()),
    series:     z.array(z.object({ name: z.string(), data: z.array(z.number()) })),
    height:     z.number().optional().default(300),
  }),
  component: ({ props }: ComponentRendererProps): ReactNode => {
    // receives already-resolved props as plain JS values
    const categories = props["categories"] as string[];
    const series     = props["series"] as { name: string; data: number[] }[];
    return <RechartsBarChart data={...}>...</RechartsBarChart>;
  },
});
```

**The `description` string is what the AI reads.** It determines when and how
the LLM chooses to use the component. Write it like instructions to a junior dev.

**Three files for each new component:**
1. `packages/elements/category/my-component.tsx` — the actual component
2. `packages/elements/library.ts` — register for client-side rendering
3. `packages/elements/server.ts` — register stub for server-side prompt generation

---

## Complete data flow diagram

```
┌─────────────────────────────────────────────────────────────────┐
│  Browser                                                        │
│                                                                 │
│  User message → POST /api/chat/ui                               │
│                        │                                        │
│                        ▼                                        │
│  ┌─────────────────────────────────────────┐                    │
│  │  Gemini (via LangChain)                 │                    │
│  │                                         │                    │
│  │  System prompt (from generatePrompt())  │                    │
│  │  + conversation history                 │                    │
│  │                                         │                    │
│  │  → streams MorphicLang DSL text         │                    │
│  └──────────────────────┬──────────────────┘                    │
│                         │  chunks                               │
│                         ▼                                       │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  StreamParser                                            │   │
│  │                                                          │   │
│  │  buffer grows with each chunk                            │   │
│  │  ├── completed statements → cached AST                   │   │
│  │  └── pending tail → autoclose → temporary AST            │   │
│  │                                  │                       │   │
│  │                                  ▼                       │   │
│  │  Resolver (resolveFromASTMap)                            │   │
│  │  ├── symbol table (name → ASTNode)                       │   │
│  │  ├── resolves root recursively                           │   │
│  │  ├── @Each → eagerly expanded per-item with localScope   │   │
│  │  ├── static values → plain JS in props                   │   │
│  │  └── dynamic values (StateRef, BinOp) → AST in props     │   │
│  │                                  │                       │   │
│  │                                  ▼                       │   │
│  │  ParseResult { root: ElementNode, resolvedNodes, ... }   │   │
│  └──────────────────────────────────┬───────────────────────┘   │
│                                     │                           │
│                         ┌───────────┴───────────┐               │
│                         │                       │               │
│                         ▼                       ▼               │
│              ┌─────────────────┐    ┌─────────────────────┐    │
│              │  Interpreter    │    │  Store ($variables)  │    │
│              │                 │    │                      │    │
│              │  evaluate()     │◄───│  storeSnapshot       │    │
│              │  BinOp, Ternary,│    │  updated on click    │    │
│              │  StateRef, etc. │    │  useSyncExternalStore│    │
│              └────────┬────────┘    └─────────────────────┘    │
│                       │                                         │
│                       ▼                                         │
│              evaluatedRoot: ElementNode (all props concrete)    │
│                       │                                         │
│                       ▼                                         │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  React render tree                                       │   │
│  │                                                          │   │
│  │  MorphicRenderer                                         │   │
│  │  └── RenderNode(root)                                    │   │
│  │       └── Stack component                                │   │
│  │            ├── RenderNode(header) → Text component       │   │
│  │            └── RenderNode(content) → BarChart component  │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

---

## Key design decisions to know

### Why a custom DSL instead of JSON?

JSON is ambiguous for component trees (no difference between a component call
and a data object). MorphicLang is unambiguous, streamable line-by-line, and
allows expressions (ternaries, member access, arithmetic) that JSON cannot.

### Why two-phase parsing (resolver + interpreter)?

The resolver runs once per chunk — it's fast. Dynamic props (state-dependent)
are left as AST nodes and only evaluated by the interpreter when state changes.
This means most of the tree is a stable, pre-resolved object that React can
skip re-rendering.

### Why is `@Each` expanded at resolve time, not render time?

If `@Each` stayed as an ASTNode until render time, the renderer would need to
understand iteration — it would become a template engine. By expanding eagerly
in the resolver, the renderer stays simple: it only ever renders `ElementNode` trees.

### Why does streaming order matter?

`root` must come first because the `StreamParser` renders incrementally.
Unresolved references (statements that haven't arrived yet) are rendered as
`null` / placeholder. As soon as the referenced statement arrives in the stream,
it resolves and React re-renders that subtree. This gives the "skeleton fills in"
streaming effect.

### Why two component registrations (library.ts and server.ts)?

`library.ts` is imported client-side and contains real React components.
`server.ts` is imported by the API route (server-side) and only contains Zod
schemas + stub functions — no React. This keeps the API route lean and avoids
importing React/shadcn into the server bundle. Both must have identical
`description` and `props` so the prompt matches what the renderer can actually render.
