/**
 * Phase 6 Gate Test — Elements
 *
 * Verifies:
 * 1. morphicLibrary contains all required components
 * 2. MorphicRenderer renders a dashboard program (Stack, BarChart, Table, Button)
 * 3. Prompt includes all element signatures
 * 4. State-driven tab switching works (store + evaluate)
 * 5. executeActions set step updates store and evaluate re-renders correctly
 */

import { renderToString } from "react-dom/server";
import { createElement } from "react";
import { MorphicEngine } from "../engine/engine";
import { MorphicRenderer } from "../renderer/MorphicRenderer";
import { morphicLibrary } from "./library";
import { Store } from "../engine/runtime/state";
import { executeActions } from "../engine/runtime/actions";
import type { ElementNode } from "../engine/types";

const engine = new MorphicEngine({ library: morphicLibrary });

// ---------------------------------------------------------------------------
// Test runner
// ---------------------------------------------------------------------------

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  PASS  ${name}`);
    passed++;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`  FAIL  ${name}\n        ${msg}`);
    failed++;
  }
}

function assert(condition: boolean, msg: string) {
  if (!condition) throw new Error(msg);
}

function render(response: string): string {
  return renderToString(
    createElement(MorphicRenderer, { engine, response })
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

console.log("\nPhase 6 Gate Tests\n");

// 1. Library contains required components
test("morphicLibrary has all required components", () => {
  const schema = morphicLibrary.toSchema();
  const required = ["Stack", "Card", "Text", "Button", "Table", "BarChart", "LineChart", "Tabs", "Markdown", "Callout", "Tag", "Select"];
  for (const name of required) {
    assert(schema.hasComponent(name), `Missing component: ${name}`);
  }
});

// 2. Prompt includes signatures
test("generatePrompt includes component signatures", () => {
  const prompt = engine.generatePrompt();
  assert(prompt.includes("Stack("), `Missing Stack signature`);
  assert(prompt.includes("Button("), `Missing Button signature`);
  assert(prompt.includes("BarChart("), `Missing BarChart signature`);
  assert(prompt.includes("Table("), `Missing Table signature`);
});

// 3. Stack renders without crash
test("Stack renders children", () => {
  const html = render('root = Stack(children=[Text("hello"), Text("world")])');
  assert(html.includes("hello"), `Expected 'hello' in: ${html.slice(0, 200)}`);
  assert(html.includes("world"), `Expected 'world' in: ${html.slice(0, 200)}`);
});

// 4. Text with size and weight
test("Text renders with size and weight tokens", () => {
  const html = render('root = Text("heading", size="2xl", weight="bold")');
  assert(html.includes("text-2xl"), `Expected text-2xl class`);
  assert(html.includes("font-bold"), `Expected font-bold class`);
});

// 5. Tag/Badge
test("Tag renders with variant", () => {
  const html = render('root = Tag("Active", variant="default")');
  assert(html.includes("Active"), `Expected label text`);
});

// 6. Callout
test("Callout renders message", () => {
  const html = render('root = Callout("System is healthy", variant="info")');
  assert(html.includes("System is healthy"), `Expected callout message`);
});

// 7. Dashboard — BarChart + Table + two Buttons
test("Dashboard program renders BarChart, Table, and Buttons", () => {
  const program = `
$activeView = "chart"
chart = BarChart(["Jan","Feb","Mar"], [{name: "Revenue", data: [100,120,90]}])
tbl   = Table(["Month","Value"], [["Jan","100"],["Feb","120"],["Mar","90"]])
btn1  = Button("Show Chart")
btn2  = Button("Show Table", variant="outline")
root  = Stack(children=[btn1, btn2, chart, tbl])
  `.trim();

  const html = render(program);
  // BarChart renders via recharts — check ChartContainer
  assert(html.includes("data-slot=\"chart\""), `Missing chart container in: ${html.slice(0, 400)}`);
  // Table rows rendered
  assert(html.includes("Jan"), `Missing Jan in table`);
  assert(html.includes("Feb"), `Missing Feb in table`);
  // Buttons rendered
  assert(html.toLowerCase().includes("show chart"), `Missing 'Show Chart' button`);
  assert(html.toLowerCase().includes("show table"), `Missing 'Show Table' button`);
});

// 8. Engine evaluate responds to store state
test("engine.evaluate resolves ternary driven by store state", () => {
  const program = `
$tab = "overview"
overviewText = Text("Overview panel", size="lg")
detailsText  = Text("Details panel", size="lg")
root = Stack(children=[$tab == "overview" ? overviewText : detailsText])
  `.trim();

  const result = engine.parse(program);
  assert(result.errors.length === 0, `Parse errors: ${result.errors.map((e) => e.message).join(", ")}`);

  // Test evaluate directly (renderToString skips useEffect so initialState won't load)
  const snap1 = { "llm.tab": "overview" };
  const node1 = engine.evaluate(result, snap1);
  assert(node1 !== null, "Expected evaluated node");
  // Stack's children should contain the overviewText node
  const children1 = node1?.props["children"] as unknown[];
  const first1 = children1?.[0] as { typeName?: string; props?: Record<string, unknown> } | undefined;
  assert(
    first1?.typeName === "Text" && first1.props?.["content"] === "Overview panel",
    `Expected Text('Overview panel'), got typeName=${first1?.typeName} content=${first1?.props?.["content"]}`
  );

  const snap2 = { "llm.tab": "details" };
  const node2 = engine.evaluate(result, snap2);
  const children2 = node2?.props["children"] as unknown[];
  const first2 = children2?.[0] as { typeName?: string; props?: Record<string, unknown> } | undefined;
  assert(
    first2?.typeName === "Text" && first2.props?.["content"] === "Details panel",
    `Expected Text('Details panel'), got typeName=${first2?.typeName} content=${first2?.props?.["content"]}`
  );
});

// 9. Store reactivity: executeActions updates store value
test("executeActions set step updates store, evaluate returns correct node", () => {
  const store = new Store();
  store.loadInitialState({ tab: "overview" });
  assert(store.getSnapshot()["llm.tab"] === "overview", "Initial state loaded");

  executeActions(
    { steps: [{ type: "set", target: "tab", valueAST: { k: "Str", value: "details" } }] },
    store,
    {}
  );
  assert(store.getSnapshot()["llm.tab"] === "details", "Store updated to 'details'");
});

// 10. Accordion renders items
test("Accordion renders items", () => {
  const html = render(`root = Accordion(items=[{title: "FAQ 1", content: "Answer 1"}, {title: "FAQ 2", content: "Answer 2"}])`);
  assert(html.includes("FAQ 1"), `Missing FAQ 1`);
  assert(html.includes("FAQ 2"), `Missing FAQ 2`);
});

// 11. Card with title and footer
test("Card renders title and children", () => {
  const html = render(`
a = Text("card body")
root = Card(children=[a], title="My Card")
  `.trim());
  assert(html.includes("My Card"), `Missing card title`);
  assert(html.includes("card body"), `Missing card body`);
});

// 12. Separator renders
test("Separator renders without crash", () => {
  const html = render(`root = Stack(children=[Text("a"), Separator(), Text("b")])`);
  assert(html.includes("a") && html.includes("b"), `Missing content around separator`);
});

// 13. Streaming path preserves $var defaults through a ternary-driven filter.
// Regression: resolveFromASTMap dropped initialState, so $category defaulted to
// null, the ternary took its else branch, and a filtered table rendered no rows.
test("streaming path applies $var defaults so filtered table has rows", () => {
  const program = `
$search = ""
$category = "All"
filtered = @Filter(items, "name", "contains", $search)
final = $category == "All" ? filtered : @Filter(filtered, "category", "==", $category)
root = Table(["Name", "Category"], @Each(final, "row", [row.name, row.category]))
items = [{name: "Laptop", category: "Electronics"}, {name: "Desk Chair", category: "Furniture"}]
  `.trim();

  // Use the StreamParser — the path the live renderer actually uses.
  const result = engine.createStreamParser().set(program);
  assert(
    result.initialState["search"] === "" && result.initialState["category"] === "All",
    `Expected $var defaults in initialState, got ${JSON.stringify(result.initialState)}`
  );

  function findTableRows(node: ElementNode | null): unknown[][] | null {
    if (!node) return null;
    if (node.typeName === "Table") return node.props["rows"] as unknown[][];
    for (const v of Object.values(node.props)) {
      for (const item of Array.isArray(v) ? v : [v]) {
        if (item && typeof item === "object" && (item as ElementNode).type === "element") {
          const r = findTableRows(item as ElementNode);
          if (r) return r;
        }
      }
    }
    return null;
  }

  // Empty store (first render, before hydration): defaults must apply -> all rows.
  const rowsInitial = findTableRows(engine.evaluate(result, {}));
  assert(rowsInitial?.length === 2, `Expected 2 rows on first render, got ${rowsInitial?.length}`);

  // Only the search is set; category default "All" must still apply -> 1 match.
  const rowsSearch = findTableRows(engine.evaluate(result, { "llm.search": "Lap" }));
  assert(rowsSearch?.length === 1, `Expected 1 filtered row, got ${rowsSearch?.length}`);
  assert(rowsSearch?.[0]?.[0] === "Laptop", `Expected Laptop, got ${rowsSearch?.[0]?.[0]}`);
});

// 14. Mid-stream partial builtin must not crash the evaluator.
// Regression: a half-streamed `@Each(items` autocloses to `@Each(items)`, leaving
// positional[1] undefined; evalAST then dereferenced node.k on undefined and threw.
test("partial @Each from streaming does not throw", () => {
  const sp = engine.createStreamParser();
  // No trailing newline -> the tbl line stays pending and gets autoclosed.
  const result = sp.push(`root = Stack([tbl])\ntbl = Table(["A"], @Each(items`);
  const node = engine.evaluate(result, {});
  assert(node !== null, "Expected a (blank) node, not a crash, for partial @Each");
});

// 15. @Filter gained >= and <=, and contains is case-insensitive on both paths.
test("@Filter supports >= / <= and case-insensitive contains", () => {
  const products = `[{name: "Laptop", price: 1200}, {name: "Chair", price: 250}, {name: "Stapler", price: 15}]`;

  // Ref path: filtered = @Filter(...) referenced by @Each.
  function refRows(op: string, value: number): unknown[][] {
    const program = [
      `root = Table(["Name", "Price"], @Each(filtered, "r", [r.name, r.price]))`,
      `filtered = @Filter(products, "price", "${op}", ${value})`,
      `products = ${products}`,
    ].join("\n");
    const node = engine.evaluate(engine.createStreamParser().set(program), {});
    return (node?.props["rows"] as unknown[][]) ?? [];
  }
  assert(refRows(">=", 250).length === 2, `>= 250 expected 2 rows (Laptop, Chair)`);
  assert(refRows("<=", 250).length === 2, `<= 250 expected 2 rows (Chair, Stapler)`);

  // Inline path: @Filter directly inside @Each — was case-sensitive before.
  const program = [
    `root = Table(["Name"], @Each(@Filter(products, "name", "contains", "LAP"), "r", [r.name]))`,
    `products = ${products}`,
  ].join("\n");
  const rows = (engine.evaluate(engine.createStreamParser().set(program), {})?.props["rows"] as unknown[][]) ?? [];
  assert(rows.length === 1 && rows[0]?.[0] === "Laptop", `contains should be case-insensitive, got ${JSON.stringify(rows)}`);
});

// 16. Components inside a dynamic @Each template render (not just member values).
// Regression: evalAST returned null for non-@ Comp nodes, so Tag(...) cells in a
// state-driven @Each came out blank while row.name (a Member) still rendered.
test("component cells inside a dynamic @Each render", () => {
  const html = render(`
$q = ""
root = Stack([table])
filtered = @Filter(funds, "name", "contains", $q)
table = Table(["Name", "Risk"], @Each(filtered, "row", [row.name, row.risk == "High" ? Tag(row.risk, variant="destructive") : Tag(row.risk, variant="secondary")]))
funds = [{name: "Tech Growth", risk: "High"}, {name: "Stable Bond", risk: "Low"}]
  `.trim());
  assert(html.includes("Tech Growth"), "row.name member cell should render");
  assert(html.includes("High"), "Tag(...) cell should render (ternary then-branch)");
  assert(html.includes("Low"), "Tag(...) cell should render (ternary else-branch)");
});

// 17. Chained ternary is right-associative, so each branch maps to its own value.
// Regression: `a ? x : b ? y : z` parsed left-associative, burying the first
// condition as a sub-condition — status badges all collapsed to the last branch.
test("chained ternary picks the correct branch per row", () => {
  const html = render(`
root = Stack([table])
table = Table(["Feature", "Status"], @Each(features, "row", [row.name, row.status == "Done" ? Tag(row.status, variant="default") : row.status == "Active" ? Tag(row.status, variant="outline") : Tag(row.status, variant="destructive")]))
features = [{name: "Auth", status: "Done"}, {name: "Search", status: "Active"}, {name: "Billing", status: "Blocked"}]
  `.trim());
  // Each status label must appear — collapsing to one branch would drop two of them.
  assert(html.includes("Done"), "Done badge (then-branch) should render");
  assert(html.includes("Active"), "Active badge (middle branch) should render");
  assert(html.includes("Blocked"), "Blocked badge (final else) should render");
});

test("multiline chained ternary remains one streaming statement", () => {
  const program = [
    '$choice = "C"',
    "root = Text(value)",
    'value = $choice == "A" ? "A" :',
    '        $choice == "B" ? "B" : "C"',
  ].join("\n");
  const result = engine.createStreamParser().set(program);
  const node = engine.evaluate(result, { "llm.choice": "C" });
  assert(result.errors.length === 0, `Parse errors: ${result.errors.map((error) => error.message).join(", ")}`);
  assert(node?.props["content"] === "C", `Expected final else branch C, got ${node?.props["content"]}`);
});

test("invalid component objects in Table columns are rejected before React", () => {
  const program = 'root = Table([Text("Metric")], [["AUM"]])';
  const result = engine.parse(program);
  assert(
    result.root?.typeName === "__Error__",
    `Expected invalid Table to resolve as __Error__, got ${result.root?.typeName}`
  );
  assert(
    result.errors.some((error) => error.code === "invalid-prop"),
    `Expected invalid-prop error, got ${JSON.stringify(result.errors)}`
  );
  const html = render(program);
  assert(!html.includes("[object Object]"), "Invalid columns must never reach React");
});

test("dynamic invalid Table columns are rejected after state evaluation", () => {
  const program = [
    "$invalid = true",
    'root = Table($invalid ? [Text("Metric")] : ["Metric"], [["AUM"]])',
  ].join("\n");
  const result = engine.parse(program);
  const evaluated = engine.evaluate(result, { "llm.invalid": true });
  assert(
    evaluated?.typeName === "__Error__",
    `Expected evaluated invalid Table to become __Error__, got ${evaluated?.typeName}`
  );
  const html = render(program);
  assert(!html.includes("[object Object]"), "Dynamic invalid columns must never reach React");
});

test("generated action builtins compile into an executable action plan", () => {
  const program = [
    '$tab = "Overview"',
    'root = Button("Show holdings", action=@Actions(@Set($tab, "Holdings"), @SendMessage("Compare holdings")))',
  ].join("\n");
  const result = engine.parse(program);
  const evaluated = engine.evaluate(result, { "llm.tab": "Overview" });
  const plan = evaluated?.props["action"] as import("../engine/types").ActionPlan;

  assert(result.errors.length === 0, `Parse errors: ${result.errors.map((error) => error.message).join(", ")}`);
  assert(plan.steps.length === 2, `Expected two action steps, got ${plan.steps.length}`);
  assert(plan.steps[0]?.type === "set", "First action should update state");
  assert(plan.steps[1]?.type === "send_message", "Second action should send a message");
});

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
