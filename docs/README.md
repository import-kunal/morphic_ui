# MorphicUI documentation

> **CURRENT 2026-08-26.** Start here when changing the application or operating its database.

| Document | Use it for |
| --- | --- |
| [Architecture and complete lifecycle](architecture-lifecycle.md) | Prompts, agent tools, streaming, rendering, interaction, logging, failure paths, and Docker flow. |
| [PostgreSQL database](iqra-data-sources.md) | Restore, pgAdmin, read-only credentials, environment settings, and verification. |
| [Master blueprint](MORPHIC_UI_BLUEPRINT.md) | MorphicLang grammar, component model, engine, and design decisions. |
| [Renderer internals](how-the-renderer-works.md) | Parser, resolver, state, and React rendering behavior. |
| [Customization](customization.md) | Themes, tokens, elements, and component registration. |

The architecture lifecycle is the code-level operating view. The master blueprint remains the deeper
language and engine reference. When behavior changes, update both where their scopes overlap.
