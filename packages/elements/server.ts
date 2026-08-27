// Server-safe schema library — no React, no shadcn imports.
// Used by API routes that need generatePrompt() but never render components.
import { z } from "zod";
import { createLibrary } from "@/packages/engine";

const stub = () => null;

export const morphicSchemaLibrary = createLibrary({
  root: "Stack",
  components: [
    // ── Layout ────────────────────────────────────────────────────────────
    {
      name: "Stack",
      description: "Flex container for laying out children. Direction defaults to column. direction=\"row\" auto-collapses to column on mobile — prefer row for side-by-side sections, column for stacked content.",
      props: z.object({
        children:  z.array(z.unknown()),
        direction: z.enum(["row", "column"]).optional().default("column"),
        gap:       z.enum(["none", "xs", "sm", "md", "lg", "xl"]).optional().default("md"),
        align:     z.enum(["start", "center", "end", "stretch"]).optional().default("stretch"),
        justify:   z.enum(["start", "center", "end", "between"]).optional().default("start"),
        wrap:      z.boolean().optional().default(false),
      }),
      component: stub,
      ref: z.unknown(),
    },
    {
      name: "Grid",
      description: "Responsive CSS grid for card galleries and image grids. columns=2 gives a 2-up layout (1 col on mobile, 2 on tablet+). Use instead of Stack(direction=\"row\") when you want wrapping cards.",
      props: z.object({
        children: z.array(z.unknown()),
        columns:  z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]).optional().default(2),
        gap:      z.enum(["none", "xs", "sm", "md", "lg", "xl"]).optional().default("md"),
      }),
      component: stub,
      ref: z.unknown(),
    },
    {
      name: "Card",
      description: "A card container with optional title and footer.",
      props: z.object({
        children: z.array(z.unknown()),
        title:    z.string().optional(),
        footer:   z.string().optional(),
      }),
      component: stub,
      ref: z.unknown(),
    },
    {
      name: "Tabs",
      description: "Tabbed navigation. labels[] are tab names, selected=$var tracks the active tab, stateKey= names the $var to update on click, children[] are the panels (one per label).",
      props: z.object({
        labels:   z.array(z.string()),
        selected: z.string(),
        children: z.array(z.unknown()).optional(),
        stateKey: z.string().optional(),
        action:   z.unknown().optional(),
      }),
      component: stub,
      ref: z.unknown(),
    },
    {
      name: "Accordion",
      description: "Collapsible accordion. items[] are { title, content } objects.",
      props: z.object({
        items: z.array(z.object({ title: z.string(), content: z.string() })),
        type:  z.enum(["single", "multiple"]).optional().default("single"),
      }),
      component: stub,
      ref: z.unknown(),
    },
    {
      name: "Separator",
      description: "A visual divider line. Use between sections.",
      props: z.object({
        orientation: z.enum(["horizontal", "vertical"]).optional().default("horizontal"),
      }),
      component: stub,
      ref: z.unknown(),
    },

    // ── Content ───────────────────────────────────────────────────────────
    {
      name: "Text",
      description: "A styled text block. Use for headings, labels, and body copy.",
      props: z.object({
        content: z.string(),
        size:    z.enum(["xs", "sm", "base", "lg", "xl", "2xl", "3xl"]).optional().default("base"),
        weight:  z.enum(["normal", "medium", "semibold", "bold"]).optional().default("normal"),
        color:   z.enum(["default", "muted", "primary", "destructive", "success", "warning"]).optional().default("default"),
      }),
      component: stub,
      ref: z.unknown(),
    },
    {
      name: "Markdown",
      description: "Renders GitHub-flavored markdown safely. Use for rich text, explanations, and lists.",
      props: z.object({
        content: z.string(),
      }),
      component: stub,
      ref: z.unknown(),
    },
    {
      name: "Image",
      description: "Displays an image from a URL. src must be http or https. For placeholder/example images always use https://picsum.photos/seed/{meaningful-seed}/{width}/{height} (e.g. https://picsum.photos/seed/albania/800/400) — never use Unsplash URLs as they require auth and will break.",
      props: z.object({
        src:    z.string(),
        alt:    z.string(),
        width:  z.number().optional(),
        height: z.number().optional(),
      }),
      component: stub,
      ref: z.unknown(),
    },
    {
      name: "Callout",
      description: "An alert callout box for info, warning, error, or success messages.",
      props: z.object({
        message: z.string(),
        variant: z.enum(["info", "warning", "error", "success"]).optional().default("info"),
      }),
      component: stub,
      ref: z.unknown(),
    },

    // ── Charts ────────────────────────────────────────────────────────────
    {
      name: "RadarChart",
      description: "Radar/spider chart for comparing multiple metrics across categories. metrics[] are the axis labels, series[] are { name, data[] } objects with one value per metric.",
      props: z.object({
        metrics: z.array(z.string()),
        series:  z.array(z.object({ name: z.string(), data: z.array(z.number()) })),
        height:  z.number().optional().default(300),
      }),
      component: stub,
      ref: z.unknown(),
    },
    {
      name: "RadialChart",
      description: "Radial bar chart — circular progress bars stacked outward. data[] is { label, value } objects. maxValue sets the full-bar ceiling (default 100).",
      props: z.object({
        data:     z.array(z.object({ label: z.string(), value: z.number() })),
        maxValue: z.number().optional().default(100),
        height:   z.number().optional().default(300),
      }),
      component: stub,
      ref: z.unknown(),
    },
    {
      name: "BarChart",
      description: "Bar chart. categories[] are X-axis labels, series[] are { name, data[] } objects.",
      props: z.object({
        categories: z.array(z.string()),
        series:     z.array(z.object({ name: z.string(), data: z.array(z.number()) })),
        variant:    z.enum(["grouped", "stacked"]).optional().default("grouped"),
        height:     z.number().optional().default(300),
      }),
      component: stub,
      ref: z.unknown(),
    },
    {
      name: "LineChart",
      description: "Line chart for chronological trends. categories[] are X-axis labels and series[] are { name, data[] } objects. yAxisMode=auto focuses the scale around the observed range with padding; use zero only when a zero baseline is essential.",
      props: z.object({
        categories: z.array(z.string()),
        series:     z.array(z.object({ name: z.string(), data: z.array(z.number()) })),
        yAxisMode:  z.enum(["auto", "zero"]).optional().default("auto"),
        height:     z.number().optional().default(300),
      }),
      component: stub,
      ref: z.unknown(),
    },
    {
      name: "PieChart",
      description: "Pie or donut chart. data[] is an array of { label, value } objects.",
      props: z.object({
        data:  z.array(z.object({ label: z.string(), value: z.number() })),
        donut: z.boolean().optional().default(false),
      }),
      component: stub,
      ref: z.unknown(),
    },
    {
      name: "AreaChart",
      description: "Area chart with fill. categories[] are X-axis labels, series[] are { name, data[] } objects.",
      props: z.object({
        categories: z.array(z.string()),
        series:     z.array(z.object({ name: z.string(), data: z.array(z.number()) })),
        stacked:    z.boolean().optional().default(false),
        height:     z.number().optional().default(300),
      }),
      component: stub,
      ref: z.unknown(),
    },

    // {
    //   name: "FunnelChart",
    //   description: "Funnel chart for showing stages or drop-off. data[] is { label, value } objects, ordered from largest to smallest.",
    //   props: z.object({
    //     data:   z.array(z.object({ label: z.string(), value: z.number() })),
    //     height: z.number().optional().default(300),
    //   }),
    //   component: stub,
    //   ref: z.unknown(),
    // },
    // {
    //   name: "SankeyChart",
    //   description: "Sankey flow diagram. nodes[] are label strings. links[] are { from, to, value } objects using the node label names (not indices) — the engine maps them to indices automatically.",
    //   props: z.object({
    //     nodes:  z.array(z.string()),
    //     links:  z.array(z.object({ from: z.string(), to: z.string(), value: z.number() })),
    //     height: z.number().optional().default(300),
    //   }),
    //   component: stub,
    //   ref: z.unknown(),
    // },

    // ── Actions ───────────────────────────────────────────────────────────
    {
      name: "Button",
      description: "A clickable button. Specify action= to trigger state changes or navigation.",
      props: z.object({
        label:   z.string(),
        action:  z.unknown().optional(),
        variant: z.enum(["default", "secondary", "outline", "ghost", "destructive", "link"]).optional().default("default"),
        size:    z.enum(["sm", "md", "lg"]).optional().default("md"),
      }),
      component: stub,
      ref: z.unknown(),
    },
    {
      name: "ButtonGroup",
      description: "A horizontal row of buttons.",
      props: z.object({
        children: z.array(z.unknown()),
      }),
      component: stub,
      ref: z.unknown(),
    },

    // ── Data ──────────────────────────────────────────────────────────────
    {
      name: "Heatmap",
      description: "Color-coded heatmap table. columns[] are headers (first is the row label column). rows[] are arrays where index 0 is the label and the rest are numbers or percent strings — cells are colored green (positive) to red (negative) relative to the range.",
      props: z.object({
        columns: z.array(z.string()),
        rows:    z.array(z.array(z.unknown())),
      }),
      component: stub,
      ref: z.unknown(),
    },
    {
      name: "Table",
      description: "A data table. columns must be a plain quoted string array (never Text, Tag, or another component); rows is an array of value arrays with the same number of cells as columns.",
      props: z.object({
        columns: z.array(z.string()),
        rows:    z.array(z.array(z.unknown())),
        caption: z.string().optional(),
      }),
      component: stub,
      ref: z.unknown(),
    },
    {
      name: "Tag",
      description: "A small badge or tag label. Good for status indicators and categories.",
      props: z.object({
        label:   z.string(),
        variant: z.enum(["default", "secondary", "destructive", "outline"]).optional().default("secondary"),
      }),
      component: stub,
      ref: z.unknown(),
    },

    // ── Forms ─────────────────────────────────────────────────────────────
    {
      name: "Input",
      description: "A text input bound to a $variable. value=$var stores what the user types.",
      props: z.object({
        value:       z.string(),
        label:       z.string().optional(),
        placeholder: z.string().optional(),
        stateKey:    z.string().optional(),
      }),
      component: stub,
      ref: z.unknown(),
    },
    {
      name: "Textarea",
      description: "A multi-line text input bound to a $variable.",
      props: z.object({
        value:       z.string(),
        label:       z.string().optional(),
        placeholder: z.string().optional(),
        stateKey:    z.string().optional(),
        rows:        z.number().optional().default(4),
      }),
      component: stub,
      ref: z.unknown(),
    },
    {
      name: "Select",
      description: "A dropdown select bound to a $variable. options[] are the choices.",
      props: z.object({
        options:  z.array(z.string()),
        value:    z.string(),
        label:    z.string().optional(),
        action:   z.unknown().optional(),
        stateKey: z.string().optional(),
      }),
      component: stub,
      ref: z.unknown(),
    },
    {
      name: "Slider",
      description: "A range slider bound to a $variable.",
      props: z.object({
        min:      z.number(),
        max:      z.number(),
        value:    z.number(),
        step:     z.number().optional().default(1),
        label:    z.string().optional(),
        stateKey: z.string().optional(),
      }),
      component: stub,
      ref: z.unknown(),
    },
    {
      name: "CheckboxGroup",
      description: "A group of checkboxes. selected=$var holds the array of checked option strings.",
      props: z.object({
        options:  z.array(z.string()),
        selected: z.array(z.string()),
        label:    z.string().optional(),
        stateKey: z.string().optional(),
      }),
      component: stub,
      ref: z.unknown(),
    },
    {
      name: "RadioGroup",
      description: "A group of radio buttons. value=$var tracks the selected option.",
      props: z.object({
        options:  z.array(z.string()),
        value:    z.string(),
        label:    z.string().optional(),
        action:   z.unknown().optional(),
        stateKey: z.string().optional(),
      }),
      component: stub,
      ref: z.unknown(),
    },
  ],
});
