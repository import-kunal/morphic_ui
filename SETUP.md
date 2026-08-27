# Set up MorphicUI locally

> **CURRENT 2026-08-27.** This guide configures the Next.js application, OpenRouter research agent,
> and read-only local PostgreSQL database for development and testing.

## Outcome

After completing this guide, MorphicUI runs at `http://localhost:3000`, the research agent can query
the local mutual-fund database, and UI responses stream through OpenRouter into the MorphicLang
renderer.

## Prerequisites

Install the following before continuing:

- [Bun](https://bun.sh/) for dependencies and application scripts.
- PostgreSQL 17 with `psql` and, optionally, pgAdmin 4.
- An [OpenRouter](https://openrouter.ai/) API key.
- The supplied PostgreSQL SQL dump if the local database has not been restored yet.

Run every command below from the project root:

```text
morphic_ui
```

## 1. Install dependencies

```powershell
bun install
```

## 2. Create the local environment file

Copy the committed example. Never commit `.env.local`.

```powershell
Copy-Item .env.example .env.local
```

Open `.env.local` and replace the OpenRouter key placeholder:

```dotenv
OPENROUTER_API_KEY=replace-with-your-openrouter-api-key
```

## 3. Configure the model used for testing

The current free-model testing profile uses MiniMax M3 as the primary model, with GLM 5.2 and
Gemma 4 31B as fallbacks:

```dotenv
OPENROUTER_MODEL=minimax/minimax-m3:free
OPENROUTER_FALLBACK_MODELS=z-ai/glm-5.2:free,google/gemma-4-31b-it:free
```

This is a testing profile, not a production reliability guarantee. Free OpenRouter endpoints can be
rate-limited, temporarily unavailable, slower, or inconsistent in tool calling. For repeatable demos
or production evaluation, use a stable paid model such as Gemini Flash after validating cost and data
handling requirements.

The remaining agent controls are:

```dotenv
OPENROUTER_REASONING_EFFORT=minimal
OPENROUTER_REASONING_MAX_TOKENS=1200
OPENROUTER_MAX_OUTPUT_TOKENS=8192
OPENROUTER_DATA_COLLECTION=deny

CHAT_TIMEOUT_MS=180000
CHAT_LOG_PROGRESS_MS=5000
CHAT_LOG_FORMAT=pretty
CHAT_MAX_CONCURRENT_REQUESTS=4
RESEARCH_AGENT_RECURSION_LIMIT=50
```

`OPENROUTER_REASONING_MAX_TOKENS` applies to each model turn, while
`RESEARCH_AGENT_RECURSION_LIMIT` bounds the complete LangChain/LangGraph execution. The
three-minute timeout is the final wall-clock safety limit for the request.

## 4. Configure PostgreSQL

Set the read-only application connection in `.env.local`:

```dotenv
DATABASE_URL=postgresql://mf_saarthi:<url-encoded-password>@127.0.0.1:5432/iqra_local
POSTGRES_SSL_MODE=disable
QUERY_TIMEOUT_MS=20000
```

Do not include angle brackets in the real URL. URL-encode reserved characters in the password.

If the database has not been created and restored, follow
[Configure the PostgreSQL database](docs/iqra-data-sources.md). That guide covers the supplied SQL
dump, `iqra_local`, the read-only `mf_saarthi` role, pgAdmin, verification, and recovery.

## 5. Verify database access

```powershell
bun run test:database
```

Expected output includes:

```text
PASS PostgreSQL connection and allow-listed fund query
```

Resolve database errors before starting agent testing. A working UI server does not prove that the
research tools can connect to PostgreSQL.

## 6. Start the development server

```powershell
bun run dev
```

Open [http://localhost:3000](http://localhost:3000). If port 3000 is occupied, Next.js prints the
alternate port in the terminal.

Environment changes are loaded only after restarting the development server.

## 7. Test the research agent

Start with narrowly scoped prompts that have explicit fund names:

```text
Who manages Parag Parikh Flexi Cap Fund?
```

```text
Show the latest market-cap allocation of Parag Parikh Flexi Cap Fund.
```

```text
Compare the valuation metrics of Parag Parikh Flexi Cap Fund and HDFC Flexi Cap Fund.
```

The terminal should identify the configured primary model, any model selected through fallback
routing, the reasoning budget, tool calls, database durations, streaming duration, and final token
usage.

## 8. Build and run the production bundle locally

```powershell
bun run build
bun run start
```

This verifies the optimized Next.js build. It does not make free model endpoints production-ready.

## Failure recovery

| Symptom                            | Action                                                                                     |
| ---------------------------------- | ------------------------------------------------------------------------------------------ |
| `OPENROUTER_API_KEY is required` | Add the key to`.env.local` and restart the server.                                       |
| OpenRouter`429`                  | Retry later or choose another available model; free shared pools are rate-limited.         |
| `No endpoints found`             | Confirm the model ID in OpenRouter's current model catalog and change the fallback list.   |
| Research reaches 180 seconds       | Inspect repeated tool calls; the model failed to finalize before the wall-clock timeout.   |
| `DATABASE_URL is required`       | Add the PostgreSQL variables to`.env.local`.                                             |
| PostgreSQL authentication failure  | Verify the role, password, port, database name, and URL encoding.                          |
| Generated UI cannot render         | Use**View source**, inspect the MorphicLang response, and check the browser console. |

## Safety notes

- Never commit `.env.local`, API keys, passwords, SQL dumps, or customer data.
- The runtime database role should remain read-only.
- Free providers may retain prompts or outputs depending on their policies. Do not send confidential
  information unless the selected provider and OpenRouter privacy settings have been approved.
- Database facts must come from tool results; model output remains a factual draft for MFD review.

## Related documentation

- [Architecture and complete lifecycle](docs/architecture-lifecycle.md)
- [PostgreSQL database](docs/iqra-data-sources.md)
- [MorphicLang and renderer internals](docs/how-the-renderer-works.md)
- [Customization](docs/customization.md)
