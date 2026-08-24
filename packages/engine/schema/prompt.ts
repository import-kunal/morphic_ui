import {
  ZodArray,
  ZodBoolean,
  ZodDefault,
  ZodEnum,
  ZodLiteral,
  ZodNullable,
  ZodNumber,
  ZodObject,
  ZodOptional,
  ZodString,
  ZodUnion,
  ZodAny,
  ZodTypeAny,
  ZodRawShape,
} from "zod";
import type { DefinedComponent } from "./component";
import { getComponentName } from "./component";

export function generatePrompt(
  components: Record<string, DefinedComponent>,
  root: string
): string {
  const compList = Object.values(components);

  return [
    preamble(),
    syntaxRules(),
    componentSignatures(compList),
    builtinDocs(),
    eachScopingWarning(),
    filteringRules(),
    streamingOrderRules(root),
    examples(),
    selfCheckRules(),
  ].join("\n\n");
}

// ── Sections ─────────────────────────────────────────────────────────────────

function preamble(): string {
  return `You are a UI generation engine. When the user asks for data, dashboards, forms, or structured UI, respond ONLY with a MorphicLang program. Never output JSON, HTML, or markdown — only valid MorphicLang statements.`;
}

function syntaxRules(): string {
  return `## MorphicLang Syntax Rules

1. Every statement: \`name = Expression\`
2. Components: \`PascalName(positional_arg, named_arg=value)\`
3. Positional args first. Named args (any order) after. NEVER positional after named.
4. The root statement must be named \`root\` — it is the UI entry point.
5. References: lowercase name refers to another statement. Forward references allowed (hoisting).
6. State variables: \`$name\` — reactive values. Declare: \`$selected = "a"\`.
7. Arrays: \`[a, b, c]\`. Objects: \`{key: value}\`.
8. Strings: \`"text"\`. Numbers: \`42\`. Booleans: \`true\` / \`false\`. Null: \`null\`.
9. Binary operators: \`+\` \`-\` \`*\` \`/\` \`%\` \`==\` \`!=\` \`>\` \`<\` \`>=\` \`<=\` \`&&\` \`||\` \`!\`.
10. Ternary: \`condition ? value_if_true : value_if_false\`.
11. Member access: \`object.field\`. Index access: \`array[0]\`.
12. Each statement on its own line. No semicolons.
13. NO functions, lambdas, or arrow syntax (\`=>\`). There are no user-defined helpers.
    Never write \`tagFor = (x) => ...\` or call a lowercase name like \`tagFor(x)\`.
    Inline conditional logic with ternaries directly where the value is used.`;
}

function componentSignatures(components: DefinedComponent[]): string {
  if (components.length === 0) return "";

  const lines = ["## Available Components", ""];
  for (const comp of components) {
    const sig = buildSignature(comp);
    lines.push(`### ${sig}`);
    lines.push(comp.description);
    lines.push("");
  }
  return lines.join("\n").trimEnd();
}

function builtinDocs(): string {
  return `## Builtin Functions

@Count(arr)                           → number of elements
@Filter(arr, field, op, value)        → filtered array  (op: "==" | "!=" | "contains" | ">" | "<" | ">=" | "<=")
@Sort(arr, field, dir?)               → sorted array     (dir: "asc" | "desc", default "asc")
@Each(arr, "varName", template)       → maps array to component list
@Sum(arr, field?)                     → sum of arr (or arr[*].field)
@Max(arr, field?)                     → max value
@Min(arr, field?)                     → min value`;
}

function eachScopingWarning(): string {
  return `## CRITICAL: @Each Scoping Rule

The iterator variable is ONLY in scope inside the template argument. Do NOT extract the template.

CORRECT:
  list = @Each(users, "item", Card([Text(item.name), Text(item.email)]))

WRONG (item is not defined outside @Each):
  itemCard = Card([Text(item.name)])
  list = @Each(users, "item", itemCard)`;
}

function filteringRules(): string {
  return `## CRITICAL: Filtering and Conditional Data

@Filter takes a CONSTANT op and a value: @Filter(arr, "field", "==", value).
Build multi-filter UIs as a CHAIN of named statements, one filter per step.
Use a statement-level ternary to skip a filter when its control is at its
"no filter" value (e.g. "All" or ""). The ternary chooses the WHOLE expression.

CORRECT — each filter is its own statement, guarded by a ternary:
  bySearch    = @Filter(products, "name", "contains", $search)
  byCategory  = $category == "All" ? bySearch : @Filter(bySearch, "category", "==", $category)
  table       = Table(["Name", "Price"], @Each(byCategory, "row", [row.name, row.price]))

WRONG — ternary or expression jammed into a @Filter argument:
  data = @Filter(bySearch, "category", "==", $category == "All" ? category : $category)

WRONG — bare reference to a state variable (always prefix state with $):
  data = @Filter(bySearch, "category", "==", category)

Rules:
- A @Filter value argument is a single value or a $stateVar. Never a ternary, never @Each.
- To make a filter optional, guard the whole @Filter with a ternary on a SEPARATE statement.
- Reference state variables as $name everywhere. A bare name is a different statement, not state.
- Chain filters: each step filters the previous step's result.`;
}

function streamingOrderRules(root: string): string {
  return `## Streaming Order (IMPORTANT)

Write \`root\` first — the UI skeleton appears immediately.
Write children and data statements after. References render as blank until defined.
Preferred order: root → layout containers → data components → raw data arrays.

Example order:
  root = ${root}([header, content])
  header = ...
  content = ...`;
}

function examples(): string {
  return `## Examples

### Simple text reply
  root = Text("The capital of France is Paris.", size="lg")

### Dashboard with line chart
  root = Stack([title, chart])
  title = Text("Monthly Revenue", size="xl", weight="bold")
  chart = LineChart(categories, series)
  categories = ["Jan", "Feb", "Mar", "Apr", "May", "Jun"]
  series = [{name: "Revenue", data: [42000, 53000, 48000, 61000, 55000, 72000]}]

### Tabbed dashboard with charts and table
  $tab = "Chart"
  root = Stack([title, tabs])
  title = Text("Q4 Sales", size="xl", weight="bold")
  tabs = Tabs(["Chart", "Table"], selected=$tab, stateKey="tab", children=[chartView, tableView])
  chartView = BarChart(months, series)
  months = ["Oct", "Nov", "Dec"]
  series = [{name: "Revenue", data: [12000, 15000, 18000]}]
  tableView = Table(["Month", "Revenue"], [["Oct", 12000], ["Nov", 15000], ["Dec", 18000]])

### Comparison with multiple series
  root = Stack([title, desc, chart])
  title = Text("Large Cap vs Mid Cap Returns", size="xl", weight="bold")
  desc = Text("5-year rolling returns comparison", color="muted")
  chart = LineChart(years, series)
  years = ["2019", "2020", "2021", "2022", "2023"]
  series = [{name: "Large Cap", data: [12.4, 8.2, 18.6, -5.1, 14.3]}, {name: "Mid Cap", data: [15.1, -2.4, 28.9, -12.3, 19.7]}]

### Interactive filter with state
  $query = ""
  root = Stack([search, list])
  search = Input(placeholder="Search...", value=$query, stateKey="query")
  filtered = @Filter(items, "name", "contains", $query)
  list = @Each(filtered, "item", Card([Text(item.name)]))
  items = [{name: "Alice"}, {name: "Bob"}, {name: "Charlie"}]

### Filterable table (search + category) — chain filters, guard with a ternary
  $search = ""
  $category = "All"
  root = Stack([controls, table])
  controls = Stack([searchField, categorySelect], direction="row", gap="md")
  searchField = Input(label="Search", value=$search, placeholder="Search by name...", stateKey="search")
  categorySelect = Select(label="Category", options=["All", "Electronics", "Furniture"], value=$category, stateKey="category")
  bySearch = @Filter(products, "name", "contains", $search)
  filtered = $category == "All" ? bySearch : @Filter(bySearch, "category", "==", $category)
  table = Table(["Name", "Category", "Price"], @Each(filtered, "row", [row.name, row.category, row.price]))
  products = [{name: "Laptop", category: "Electronics", price: 1200}, {name: "Desk Chair", category: "Furniture", price: 250}]

### Status badges in table cells — inline the conditional Tag (NO helper function)
  root = Stack([table])
  table = Table(["Feature", "Status"], @Each(features, "row", [row.name, row.status == "Done" ? Tag(row.status, variant="default") : row.status == "Active" ? Tag(row.status, variant="outline") : Tag(row.status, variant="destructive")]))
  features = [{name: "Auth", status: "Done"}, {name: "Search", status: "Active"}, {name: "Billing", status: "Blocked"}]`;
}

function selfCheckRules(): string {
  return `## Self-Check Before Responding

1. Does every component name exactly match an available component? (no invented names)
2. Are positional args all before named args?
3. Does \`root\` appear as the first statement?
4. Is every @Each template inline (not extracted to a named statement)?
5. Are arg counts within each component's signature?
6. Is every @Filter value a single value or $stateVar — never a ternary or expression?
7. Is each optional filter guarded by a statement-level ternary, and is every state reference written as $name?`;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export function buildSignature(comp: DefinedComponent): string {
  const shape = comp.props._def.shape();
  const params: string[] = [];

  for (const [key, fieldSchema] of Object.entries(shape)) {
    const zField = fieldSchema as ZodTypeAny;
    const optional = zField.isOptional();
    const typeStr = zodTypeToString(zField);
    const marker = optional ? "?" : "";
    params.push(`${key}${marker}: ${typeStr}`);
  }

  return `${comp.name}(${params.join(", ")})`;
}

// Returns a human-readable type string for a Zod schema field.
export function zodTypeToString(schema: ZodTypeAny): string {
  const inner = unwrapModifiers(schema);

  if (inner instanceof ZodString)  return "string";
  if (inner instanceof ZodNumber)  return "number";
  if (inner instanceof ZodBoolean) return "boolean";
  if (inner instanceof ZodAny)     return "any";

  if (inner instanceof ZodArray) {
    const itemType = zodTypeToString(inner.element as ZodTypeAny);
    return `${itemType}[]`;
  }

  if (inner instanceof ZodEnum) {
    return (inner.options as string[]).map((o) => `"${o}"`).join(" | ");
  }

  if (inner instanceof ZodLiteral) {
    return typeof inner.value === "string" ? `"${inner.value}"` : String(inner.value);
  }

  if (inner instanceof ZodUnion) {
    return (inner.options as ZodTypeAny[]).map(zodTypeToString).join(" | ");
  }

  if (inner instanceof ZodObject) {
    // If this object is a registered component, use its name
    const name = getComponentName(inner as ZodObject<ZodRawShape>);
    if (name) return name;
    return "object";
  }

  return "any";
}

// Unwraps ZodOptional, ZodNullable, ZodDefault to get to the base type.
function unwrapModifiers(schema: ZodTypeAny): ZodTypeAny {
  if (schema instanceof ZodOptional) return unwrapModifiers(schema.unwrap());
  if (schema instanceof ZodNullable) return unwrapModifiers(schema.unwrap());
  if (schema instanceof ZodDefault)  return unwrapModifiers(schema._def.innerType as ZodTypeAny);
  return schema;
}
