# MorphicUI — UI Customization Guide

Two questions answered here:
1. How to change the look and feel (colors, spacing, cards, components)
2. How the AI decides what to render and how much control you have over it

---

## How the renderer works (30-second version)

```
User types prompt
  → Gemini generates MorphicLang DSL text (streaming)
  → Engine parses DSL → component tree
  → Renderer maps tree → React components (shadcn/ui)
  → Browser renders it
```

The AI writes code. Your job as the developer is to control:
- **What components exist** (the palette the AI picks from)
- **How each component looks** (Tailwind classes inside each component file)
- **The design system** (colors, spacing, radius — the shared values)

---

## 1. Colors and theming → `app/globals.css`

All colors are CSS custom properties. Change these and every component
in the app updates instantly — no component files need touching.

```css
/* Dark theme (what the app uses) */
[data-theme="dark"] {
  --background:    oklch(0.145 0 0);   /* page background */
  --foreground:    oklch(0.985 0 0);   /* default text */
  --card:          oklch(0.205 0 0);   /* card background */
  --card-foreground: oklch(0.985 0 0);
  --primary:       oklch(0.922 0 0);   /* primary buttons, accents */
  --muted:         oklch(0.269 0 0);   /* subtle backgrounds */
  --muted-foreground: oklch(0.708 0 0); /* secondary text */
  --border:        oklch(0.269 0 0);   /* dividers, outlines */
  --radius:        0.625rem;           /* global border-radius */

  /* Chart palette */
  --chart-1: oklch(0.646 0.222 41.116);
  --chart-2: oklch(0.6   0.118 184.714);
  --chart-3: oklch(0.398 0.07  227.392);
  --chart-4: oklch(0.828 0.189 84.429);
  --chart-5: oklch(0.769 0.188 70.08);
}
```

**oklch format:** `oklch(lightness chroma hue)`.
- Lightness: 0 = black, 1 = white
- Chroma: 0 = grey, 0.3+ = vivid
- Hue: 0–360 (red=30, green=150, blue=250, purple=300)

**Example — make primary color blue:**
```css
--primary: oklch(0.6 0.2 250);           /* blue */
--primary-foreground: oklch(0.98 0 0);   /* white text on it */
```

**Example — make cards slightly lighter:**
```css
--card: oklch(0.22 0 0);   /* was 0.205, bump it up slightly */
```

---

## 2. Spacing, gaps, typography → `lib/tokens.ts`

This file maps token names to Tailwind classes. Every MorphicUI component
uses these maps — change one entry and it propagates everywhere.

```ts
// lib/tokens.ts

export const gap = {
  none: "",
  xs:   "gap-1",   // 4px
  sm:   "gap-2",   // 8px
  md:   "gap-4",   // 16px  ← default for most components
  lg:   "gap-6",   // 24px
  xl:   "gap-8",   // 32px
};

export const gridColumns = {
  1: "grid-cols-1",
  2: "grid-cols-1 sm:grid-cols-2",         // 1 col mobile, 2 on tablet+
  3: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
  4: "grid-cols-2 lg:grid-cols-4",
};
```

**Rule:** never use string interpolation (`gap-${n}` is forbidden — Tailwind
can't purge dynamic classes). Always add a new entry to the token map.

---

## 3. Individual component styling → `packages/elements/`

Each component is one file. Open it, change the Tailwind classes, done.

### Card — `packages/elements/layout/card.tsx`

```tsx
// Change padding, background, border, shadow here
<div className="rounded-xl border border-border bg-card p-4 shadow-sm">
```

Want more padding? `p-4` → `p-6`.
Want a stronger shadow? Add `shadow-md`.
Want no border? Remove `border border-border`.

### Stack — `packages/elements/layout/stack.tsx`

```tsx
<div className={cn("flex w-full [&>*]:min-w-0", ...tokens)}>
```

The `[&>*]:min-w-0` prevents flex children from overflowing.
The `[&>*]:flex-1` (added in row mode) makes children equal width.

### Image — `packages/elements/content/image.tsx`

```tsx
<img
  className="w-full rounded-md object-cover"
  style={{
    height:    height ? `min(${height}px, 280px)` : undefined,
    maxHeight: "280px",   // ← hard cap so tall images don't blow layouts
  }}
/>
```

Change `280px` to whatever max height you want.
Change `object-cover` to `object-contain` to show the full image without cropping.

### Text — `packages/elements/content/text.tsx`

Uses `textSize`, `fontWeight`, `textColor` tokens from `lib/tokens.ts`.
Change the token maps to affect all Text components.

### Charts

Each chart file (`bar-chart.tsx`, `line-chart.tsx`, etc.) controls its own
Recharts config — colors, margins, axes, tooltips.
Chart palette comes from `--chart-1` through `--chart-5` CSS vars in globals.css.

---

## 4. Adding a new component

Three files need to be touched. The pattern is always the same.

### Step 1 — Create `packages/elements/category/my-component.tsx`

```tsx
import { z } from "zod";
import { defineComponent } from "@/packages/engine";
import type { ComponentRendererProps } from "@/packages/engine/types";
import type { ReactNode } from "react";

export const MyComponent = defineComponent({
  name: "MyComponent",

  // THIS IS WHAT THE AI READS. Write it like instructions to a junior dev.
  // Be specific about when to use it vs other components.
  description: "A metric card showing a KPI value with optional trend indicator. Use for dashboard numbers, not for body text.",

  // Required props come first (positional args in DSL).
  // Optional props come after (named args in DSL).
  props: z.object({
    value:   z.string(),                          // required, positional
    label:   z.string(),                          // required, positional
    trend:   z.enum(["up", "down", "flat"]).optional(),
    prefix:  z.string().optional(),
  }),

  component: ({ props }: ComponentRendererProps): ReactNode => {
    const value  = props["value"] as string;
    const label  = props["label"] as string;
    const trend  = props["trend"] as "up" | "down" | "flat" | undefined;

    return (
      <div className="rounded-xl border border-border bg-card p-4">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="text-2xl font-bold">{value}</p>
        {trend === "up"   && <span className="text-green-500 text-xs">↑</span>}
        {trend === "down" && <span className="text-red-500  text-xs">↓</span>}
      </div>
    );
  },
});
```

### Step 2 — Register in `packages/elements/library.ts` (client-side)

```ts
import { MyComponent } from "./category/my-component";

export const morphicLibrary = createLibrary({
  components: [
    Stack, Grid, Card, MyComponent,   // ← add here
    ...
  ],
});
```

### Step 3 — Add stub to `packages/elements/server.ts` (server-side prompt generation)

```ts
{
  name: "MyComponent",
  description: "...",   // same description as above
  props: z.object({
    value:  z.string(),
    label:  z.string(),
    trend:  z.enum(["up", "down", "flat"]).optional(),
    prefix: z.string().optional(),
  }),
  component: stub,
  ref: z.unknown(),
},
```

The stub in server.ts is what generates the AI's system prompt — it never
actually renders anything server-side.

---

## 5. How the AI decides what to render

### The system prompt

`packages/engine/schema/prompt.ts` generates the system prompt that goes to Gemini.
It reads every component's `name`, `description`, and `props` schema and produces
a structured prompt like:

```
Available components:

Stack(children[], direction?, gap?, align?, justify?, wrap?)
  Flex container for laying out children. direction="row" auto-collapses
  to column on mobile...

Grid(children[], columns?, gap?)
  Responsive CSS grid for card galleries. Use instead of Stack(direction="row")
  when you want wrapping cards...

Card(children[], title?, footer?)
  A card container with optional title and footer.
```

**The AI reads this and decides:**
- Which components to use
- How to nest them
- What props to pass
- How many items to put in arrays

### The AI has full freedom to:
- Nest any component inside any other (Grid inside Card, Card inside Tabs, etc.)
- Put as many children as it wants in a Stack/Grid/Card
- Repeat components (10 cards, 20 table rows, etc.)
- Combine components creatively (chart + table + callout in one response)
- Use `@Each` to generate repeated elements from data arrays

### You control the AI by:

**1. Writing better descriptions**

The description string is the only thing the AI reads to decide when/how to use a component.
"A card container" is vague. "Use for grouping related metrics, not for navigation links" is actionable.

**2. Adding rules to the system prompt** — `app/api/chat/ui/route.ts`

```ts
const SYSTEM_PROMPT =
  engine.generatePrompt() +
  '\n\nFor conversational replies with no structured data, output: root = Markdown("your response here")' +
  '\n\nAlways use Grid(columns=2) for card galleries, never Stack(direction="row") with more than 2 items.' +
  '\n\nLimit @Each loops to a maximum of 10 items unless the user explicitly requests more.';
```

**3. Restricting props** — the Zod schema is enforced at parse time. If the AI
tries to pass `columns=7` to Grid but the schema only allows 1–4, the prop is
rejected and the default is used instead.

**4. Removing components** — if you don't want the AI to use SankeyChart,
just don't register it in `server.ts`. It won't appear in the prompt.

---

## Quick reference: what file to change for what

| What you want to change | File |
|---|---|
| Background, text, card, primary color | `app/globals.css` |
| Chart colors (1–5) | `app/globals.css` — `--chart-1` through `--chart-5` |
| Global border radius | `app/globals.css` — `--radius` |
| Gap/spacing between elements | `lib/tokens.ts` — `gap` map |
| Grid column breakpoints | `lib/tokens.ts` — `gridColumns` map |
| Card padding, shadow, border | `packages/elements/layout/card.tsx` |
| Stack layout behavior | `packages/elements/layout/stack.tsx` |
| Image max height | `packages/elements/content/image.tsx` |
| Text size/weight options | `lib/tokens.ts` + `packages/elements/content/text.tsx` |
| Chart style (axes, colors, margins) | individual chart file in `packages/elements/charts/` |
| Add a new component | create `.tsx` + add to `library.ts` + add stub to `server.ts` |
| Tell AI when to use a component | edit the `description` string in that component |
| Add global AI rules | append to `SYSTEM_PROMPT` in `app/api/chat/ui/route.ts` |
