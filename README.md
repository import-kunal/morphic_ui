# MorphicUI

> A next-generation Generative UI engine that converts streaming LLM output into live, interactive React interfaces powered by shadcn/ui components.

MorphicUI is a **UI generation engine**. It provides a way for LLMs to generate UI efficiently using a compact DSL called **MorphicLang**, which is parsed and rendered as live interactive UI in real-time, token by token.

## How It Works

Instead of the LLM returning JSON or HTML (which is verbose and hard to stream), the LLM writes in **MorphicLang** — a custom language designed specifically for LLMs to generate UI efficiently.

```text
Your Components (shadcn) → System Prompt → LLM streams text → MorphicUI Engine → Live React UI
```

This approach uses 50-67% fewer tokens than equivalent JSON, streams progressively, and renders as a full interactive dashboard with charts, tables, and buttons.

## Architecture

The project is built on Next.js and structured into three core packages under `packages/`:

- `engine/`: Pure TypeScript engine with zero framework dependencies. Parses the DSL, resolves references, and handles reactive state.
- `renderer/`: The thin React adapter (bridge) that renders the parsed AST using React context and error boundaries.
- `elements/`: The actual UI components powered by shadcn/ui and Tailwind CSS.

### Two API Routes

MorphicUI uses two explicit API routes depending on the response needed:
- `POST /api/chat/ui`: Uses the full MorphicLang system prompt for rich UI generation (web dashboards, rich interfaces).
- `POST /api/chat/text`: Plain markdown response without the engine (CLI, simple chat).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Customization

You can fully customize the look and feel of MorphicUI:

- **Colors and Theming**: Edit `app/globals.css` to update CSS custom properties (oklch format).
- **Spacing and Typography**: Edit `lib/tokens.ts` to update shared Tailwind maps used across all components.
- **Component Styling**: Edit individual component files in `packages/elements/` to tweak their structure and Tailwind classes.
- **Adding New Components**:
  1. Create the component in `packages/elements/`.
  2. Register it in `packages/elements/library.ts` (client-side).
  3. Add a stub to `packages/elements/server.ts` (server-side prompt generation).

## Documentation

For more detailed information, check out the documentation in the `docs/` directory:

- [Master Blueprint](docs/MORPHIC_UI_BLUEPRINT.md) - Full architectural overview and DSL design.
- [Architecture and Complete Lifecycle](docs/architecture-lifecycle.md) - Code-verified flowcharts and sequence diagrams for prompts, streaming, rendering, interaction, failures, observability, and Docker delivery.
- [Customization Guide](docs/customization.md) - How to style, theme, and configure components.
- [How the Renderer Works](docs/how-the-renderer-works.md) - Deep dive into the rendering pipeline.

## License

MIT
# morphic_ui
