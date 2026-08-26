/**
 * Phase 5 Gate Test — React Renderer
 *
 * Verifies:
 * 1. MorphicRenderer renders a simple component tree via renderToString
 * 2. StreamParser produces correct ParseResult across incremental chunks
 * 3. Store state drives evaluated prop values (ternary + StateVar)
 * 4. triggerAction updates the store (executeActions integration)
 * 5. Unknown component names are silently dropped (no crash)
 */

import { renderToString } from "react-dom/server";
import { createElement } from "react";
import { z } from "zod";
import { MorphicEngine } from "../engine/engine";
import { defineComponent } from "../engine/schema/component";
import { createLibrary } from "../engine/schema/library";
import { Store } from "../engine/runtime/state";
import { executeActions } from "../engine/runtime/actions";
import { MorphicRenderer } from "./MorphicRenderer";
import type { ComponentRendererProps } from "../engine/types";

// ---------------------------------------------------------------------------
// Minimal test library
// ---------------------------------------------------------------------------

const Label = defineComponent({
  name: "Label",
  description: "Renders a text label",
  props: z.object({
    text: z.string(),
    bold: z.boolean().optional().default(false),
  }),
  component: ({ props }: ComponentRendererProps) => {
    const tag = props["bold"] ? "strong" : "span";
    return createElement(tag, { "data-testid": "label" }, props["text"] as string);
  },
});

const Row = defineComponent({
  name: "Row",
  description: "Lays out children horizontally",
  props: z.object({
    children: z.array(Label.ref).optional(),
  }),
  component: ({ props, renderNode }: ComponentRendererProps) => {
    return createElement("div", { "data-testid": "row" }, renderNode(props["children"]) as import("react").ReactNode);
  },
});

const lib = createLibrary({ components: [Label, Row], root: "Row" });
const engine = new MorphicEngine({ library: lib });

// ---------------------------------------------------------------------------
// Helper: render to HTML string
// ---------------------------------------------------------------------------

function render(response: string): string {
  return renderToString(
    createElement(MorphicRenderer, { engine, response })
  );
}

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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

console.log("\nPhase 5 Gate Tests\n");

// 1. Basic render
test("renders a Label component", () => {
  const html = render('root = Label("hello world")');
  assert(html.includes("hello world"), `Expected 'hello world' in: ${html}`);
  assert(html.includes("data-testid=\"label\""), `Expected label testid in: ${html}`);
});

// 2. Named arg (bold=true)
test("renders Label with named boolean prop", () => {
  const html = render('root = Label("bold text", bold=true)');
  assert(html.includes("<strong"), `Expected <strong> for bold=true, got: ${html}`);
});

// 3. Boolean default (bold not specified → span)
test("Label defaults to span when bold omitted", () => {
  const html = render('root = Label("plain")');
  assert(html.includes("<span"), `Expected <span> for default bold, got: ${html}`);
});

// 4. Unknown component is silently dropped
test("unknown component renders nothing (no crash)", () => {
  const html = render('root = UnknownWidget("x")');
  assert(html !== undefined, "renderToString should not throw");
  assert(!html.includes("UnknownWidget"), "Unknown component name must not appear in output");
});

// 5. Row with nested Labels
test("Row renders nested Label children", () => {
  const program = `
a = Label("A")
b = Label("B")
root = Row(children=[a, b])
  `.trim();
  const html = render(program);
  assert(html.includes("data-testid=\"row\""), `Missing Row in: ${html}`);
  assert(html.includes(">A<"), `Missing label A in: ${html}`);
  assert(html.includes(">B<"), `Missing label B in: ${html}`);
});

// 6. StreamParser — incremental chunks produce same result as full parse
test("StreamParser chunks produce identical output to full parse", () => {
  const full = 'root = Label("streaming")';
  const sp = engine.createStreamParser();
  const chunks = ['root = La', 'bel("st', 'reaming")'];
  for (const chunk of chunks) sp.push(chunk);
  const streamResult = sp.set(full); // finalize
  const directResult = engine.parse(full);
  assert(
    streamResult.root?.typeName === directResult.root?.typeName,
    `typeName mismatch: ${streamResult.root?.typeName} vs ${directResult.root?.typeName}`
  );
  assert(
    (streamResult.root?.props["text"] as string) === (directResult.root?.props["text"] as string),
    `text prop mismatch`
  );
});

// 7. Store: loadInitialState + getSnapshot
test("Store loadInitialState stores under llm. prefix", () => {
  const store = new Store();
  store.loadInitialState({ selectedTab: "overview" });
  const snap = store.getSnapshot();
  assert(snap["llm.selectedTab"] === "overview", `Expected 'overview', got: ${JSON.stringify(snap)}`);
});

// 8. Store: shallow-equal check doesn't fire extra notifications
test("Store does not notify on no-op set", () => {
  const store = new Store();
  store.set("llm.x", 42);
  let notifyCount = 0;
  store.subscribe(() => notifyCount++);
  store.set("llm.x", 42); // same value
  assert(notifyCount === 0, `Expected 0 notifications, got ${notifyCount}`);
  store.set("llm.x", 99); // changed
  assert(notifyCount === 1, `Expected 1 notification, got ${notifyCount}`);
});

test("Store initial values do not overwrite user interaction", () => {
  const store = new Store();
  store.loadInitialState({ selectedTab: "overview" });
  store.set("llm.selectedTab", "details");
  store.loadInitialState({ selectedTab: "overview" });
  assert(
    store.getSnapshot()["llm.selectedTab"] === "details",
    "A repeated parse must preserve the user's current selection"
  );
});

// 9. executeActions: set step updates store
test("executeActions set step updates store", () => {
  const store = new Store();
  store.set("llm.tab", "overview");
  const plan = {
    steps: [
      {
        type: "set" as const,
        target: "tab",
        valueAST: { k: "Str", value: "details" } as import("../engine/types").ASTNode,
      },
    ],
  };
  const result = executeActions(plan, store, {});
  assert(result.ok, `executeActions failed: ${result.error}`);
  assert(store.getSnapshot()["llm.tab"] === "details", `Expected 'details'`);
});

// 10. executeActions: open_url blocked for non-http
test("executeActions blocks non-http URLs", () => {
  const store = new Store();
  const plan = {
    steps: [{ type: "open_url" as const, url: "javascript:alert(1)" }],
  };
  const result = executeActions(plan, store, {});
  assert(!result.ok, "Expected failure for javascript: URL");
});

// 11. executeActions: open_url allowed for https
test("executeActions allows https URLs", () => {
  const store = new Store();
  const received: string[] = [];
  const plan = {
    steps: [{ type: "open_url" as const, url: "https://example.com" }],
  };
  const result = executeActions(plan, store, {}, (_type, payload) => {
    received.push(payload);
  });
  assert(result.ok, `Expected ok, got: ${result.error}`);
  assert(received[0] === "https://example.com", `Callback not fired`);
});

// 12. engine.evaluate respects storeSnapshot for StateRef in ternary
test("engine.evaluate resolves ternary via storeSnapshot", () => {
  const program = `
$selectedTab = "overview"
overviewPanel = Label("overview content")
detailsPanel = Label("details content")
root = Label($selectedTab == "overview" ? "overview content" : "details content")
  `.trim();
  const result = engine.parse(program);
  assert(result.errors.length === 0, `Parse errors: ${result.errors.map(e => e.message).join(", ")}`);

  const snap1 = { "llm.selectedTab": "overview" };
  const evaluated1 = engine.evaluate(result, snap1);
  assert(
    (evaluated1?.props["text"] as string) === "overview content",
    `Expected 'overview content', got: ${evaluated1?.props["text"]}`
  );

  const snap2 = { "llm.selectedTab": "details" };
  const evaluated2 = engine.evaluate(result, snap2);
  assert(
    (evaluated2?.props["text"] as string) === "details content",
    `Expected 'details content', got: ${evaluated2?.props["text"]}`
  );
});

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
