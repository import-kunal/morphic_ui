@AGENTS.md

# MorphicUI

A generative UI engine. The LLM writes MorphicLang (our custom DSL),
the engine parses and renders it as live shadcn/ui components in real-time.

Full design spec: `./MORPHIC_UI_BLUEPRINT.md`
Engineering standards: `.claude/CLAUDE.md`

---

## What This Codebase Is

Three packages inside `packages/`:
- `engine/` — pure TypeScript DSL parser + runtime. Zero framework dependencies.
- `renderer/` — thin React adapter over the engine.
- `elements/` — shadcn/ui component wrappers defined with `defineComponent()`.

Two API routes:
- `POST /api/chat/text` — plain markdown, for Telegram/bots/APIs
- `POST /api/chat/ui` — MorphicLang output, for web/rich interfaces

---

## Non-Negotiable Rules

1. `packages/engine/` never imports React or any framework. Ever.
   If it imports from `renderer/` or `elements/`, it is broken.

2. Every element component maps props through `lib/tokens.ts` for Tailwind classes.
   Never build class names with string interpolation (`gap-${value}` is forbidden).

3. `/api/chat/ui` calls `engine.generatePrompt()` as the system prompt.
   `/api/chat/text` uses a plain system prompt. Never swap them.

4. Required props come first in every Zod schema (positional args).
   Optional props come after (named args). Do not reorder.

5. `@Each(arr, "item", template)` — the iterator variable is only in scope
   inside the template argument. Do not extract the template to a separate statement.

---

## Where Things Live

- `packages/engine/types.ts` — all shared types. Read this first.
- `packages/engine/parser/resolver.ts` — AST → ElementNode (the critical bridge)
- `packages/engine/schema/prompt.ts` — system prompt generation
- `packages/renderer/hooks/useMorphicState.ts` — React orchestration hook
- `lib/tokens.ts` — design token → Tailwind class maps
