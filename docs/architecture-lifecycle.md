# MorphicUI — Architecture and Complete Lifecycle

> **CURRENT — code-verified 2026-08-26.** This document is the authority for the current MorphicUI
> prompt, request, streaming, parsing, rendering, interaction, observability, and distribution
> lifecycles. For parser internals, see [How the Renderer Works](how-the-renderer-works.md). For the
> wider design and DSL, see the [Master Blueprint](MORPHIC_UI_BLUEPRINT.md).

## Scope

This document describes the application as implemented in `morphic_ui/`. It distinguishes the
currently implemented runtime from the proposed Docker distribution path.

## 1. System context

```mermaid
flowchart LR
    User([User])

    subgraph Browser[Browser]
        Page[Chat page]
        Hook[useChat]
        Bubble[MessageBubble]
        Markdown[ReactMarkdown]
        Renderer[MorphicRenderer]
        Engine[Morphic engine]
        Elements[React element library]
    end

    subgraph NextServer[Next.js server]
        UIRoute[POST /api/chat/ui]
        TextRoute[POST /api/chat/text]
        Stream[Shared chat stream handler]
        Prompt[Prompt and schema library]
        Model[ChatGoogle adapter]
        Logs[Structured terminal logs]
    end

    Gemini[Google Gemini API]

    User --> Page --> Hook
    Hook -->|UI request| UIRoute
    Hook -->|Text request| TextRoute
    Prompt --> UIRoute
    UIRoute --> Stream
    TextRoute --> Stream
    Stream --> Model --> Gemini
    Gemini -->|streamed chunks| Model --> Stream
    Stream -->|typed SSE events| Hook
    Stream --> Logs
    Hook --> Bubble
    Bubble -->|text mode| Markdown
    Bubble -->|UI mode| Renderer --> Engine --> Elements
    Markdown --> User
    Elements --> User
```

The browser never receives the Gemini API key or constructs the system prompt. Model access and
prompt attachment remain server-side.

## 2. Prompt creation and attachment lifecycle

### 2.1 Prompt construction flow

```mermaid
flowchart TD
    ServerSchemas[server.ts component catalogue]
    Names[Component names]
    Descriptions[Component descriptions]
    Zod[Zod property schemas]
    Library[createLibrary]
    Engine[MorphicEngine.generatePrompt]
    Generator[prompt.ts generatePrompt]
    Sections[Rules, signatures, builtins, examples, self-check]
    Extra[UI-route constraints]
    Constant[Module-level SYSTEM_PROMPT]

    ServerSchemas --> Names
    ServerSchemas --> Descriptions
    ServerSchemas --> Zod
    Names --> Library
    Descriptions --> Library
    Zod --> Library
    Library --> Engine --> Generator
    Generator --> Sections
    Sections --> Constant
    Extra --> Constant
```

The UI prompt contains:

1. The MorphicUI role and output contract.
2. MorphicLang syntax rules.
3. Component signatures generated from the server-side Zod schemas.
4. Builtin operation documentation.
5. `@Each` scope and filtering constraints.
6. Streaming-order rules.
7. Worked examples.
8. A final self-check.
9. Additional route-level rules for Markdown fallback, one-line statements, and compact example data.

### 2.2 When construction and attachment happen

```mermaid
sequenceDiagram
    autonumber
    participant Runtime as Next.js module runtime
    participant Schema as Server schema library
    participant Route as UI route module
    participant Handler as Chat stream handler
    participant Agent as Model adapter
    participant Gemini as Gemini

    Runtime->>Schema: Import server-safe component catalogue
    Runtime->>Route: Evaluate route module
    Route->>Schema: engine.generatePrompt()
    Schema-->>Route: Generated MorphicLang instructions
    Route->>Route: Append route-specific constraints
    Note over Route: SYSTEM_PROMPT is retained for this module instance

    Handler->>Agent: streamChatModel(systemPrompt, history, signal)
    Agent->>Agent: Create SystemMessage(systemPrompt)
    Agent->>Agent: Append HumanMessage and AIMessage history
    Agent->>Gemini: Start streaming model request
    Gemini-->>Agent: Stream response chunks
```

The prompt string is generated once per route-module instance, but it is attached and transmitted on
every Gemini request. A development hot reload, process restart, deployment, or serverless cold start
can create a new module instance.

The text route does not use the generated MorphicLang prompt. It attaches its own short Markdown
assistant instruction.

## 3. Complete chat request sequence

```mermaid
sequenceDiagram
    autonumber
    actor User
    participant Input as ChatInput
    participant Chat as useChat
    participant Route as Next API route
    participant Stream as chat-stream.ts
    participant Adapter as agent.ts / ChatGoogle
    participant Gemini
    participant Bubble as MessageBubble
    participant View as Markdown or Morphic renderer

    User->>Input: Submit message
    Input->>Chat: send(content)
    Chat->>Chat: Lock concurrent browser send
    Chat->>Chat: Capture mode and create placeholders
    Chat->>Chat: Build same-mode conversation history
    Chat->>Route: POST messages

    Route->>Stream: handleChatStream(mode, systemPrompt)
    Stream->>Stream: Parse JSON and validate limits
    Stream->>Stream: Check server concurrency limit
    Stream-->>Chat: SSE start event and requestId
    Stream->>Adapter: streamChatModel(...)
    Adapter->>Gemini: SystemMessage plus conversation history

    loop For every provider chunk
        Gemini-->>Adapter: AIMessageChunk
        Adapter-->>Stream: Text and usage metadata
        Stream->>Stream: Update timings, counts, and token totals
        Stream-->>Chat: SSE delta event
        Chat->>Chat: Batch text until next animation frame
        Chat->>Bubble: Update assistant message
        Bubble->>View: Render by the message's captured mode
        View-->>User: Progressive response
    end

    Gemini-->>Adapter: Finish reason and final usage
    Adapter-->>Stream: Stream complete
    Stream-->>Chat: SSE done event with metrics
    Stream->>Stream: Release concurrency slot and close response
    Chat->>Bubble: Mark message as no longer streaming
    Bubble-->>User: Show actions and final content
```

### Request boundaries

| Boundary             | Current rule                                                          |
| -------------------- | --------------------------------------------------------------------- |
| Browser send         | A synchronous in-flight lock prevents duplicate sends.                |
| Conversation history | Only messages from the request's captured mode are included.          |
| Message count        | 1–30 messages.                                                       |
| Message size         | 1–16,000 characters per message.                                     |
| Total history        | At most 100,000 characters.                                           |
| Server concurrency   | Configured by`CHAT_MAX_CONCURRENT_REQUESTS`; default 4 per process. |
| Generation timeout   | Configured by`CHAT_TIMEOUT_MS`; default 180 seconds.                |
| Model retry          | `ChatGoogle` is configured for at most 2 retries.                   |

## 4. Typed streaming protocol

```mermaid
flowchart LR
    Start["start<br/>requestId, model, mode, requestStartedAt"]
    Delta["delta<br/>text"]
    Done["done<br/>complete metrics"]
    Error["error<br/>code and safe message"]

    Start --> Delta
    Delta -->|zero or more| Delta
    Delta --> Done
    Start --> Error
    Delta --> Error
```

Events are sent as Server-Sent Events using `data: JSON` records. Provider failures are carried as
typed `error` events rather than being appended to generated Markdown or MorphicLang.

## 5. UI versus text rendering branch

```mermaid
flowchart TD
    Event[SSE delta]
    Batch[Animation-frame text batch]
    Message[Assistant message state]
    Mode{Captured message mode}
    Text[ReactMarkdown]
    Sanitize[remark-gfm and rehype-sanitize]
    Morphic[MorphicRenderer]
    Parser[Incremental StreamParser]
    ReactTree[Registered React elements]

    Event --> Batch --> Message --> Mode
    Mode -->|text| Text --> Sanitize
    Mode -->|ui| Morphic --> Parser --> ReactTree
```

Mode is stored on each message. Changing the input toggle affects the next request only; it does not
reinterpret older responses.

## 6. MorphicUI incremental parse and render lifecycle

```mermaid
flowchart TD
    Snapshot[Accumulated MorphicLang response]
    Update[StreamParser.update]
    Append{New snapshot extends prior buffer?}
    Push[Parse only unseen suffix]
    Reset[Reset and parse replacement]
    Scanner[Top-level statement scanner]
    Complete[Completed statements]
    Pending[Pending tail]
    Cache[Cached AST map]
    AutoClose[Temporary autoclose]
    PendingAST[Temporary pending AST]
    Resolve[Resolve symbols and component arguments]
    Result[ParseResult]
    Defaults[Initial state defaults]
    Store[Live Store snapshot]
    Evaluate[Evaluate dynamic AST]
    Root[Concrete ElementNode root]
    RenderNode[Recursive RenderNode]
    Boundary[Per-component ErrorBoundary]
    Component[Registered React component]

    Snapshot --> Update --> Append
    Append -->|yes| Push
    Append -->|no| Reset
    Push --> Scanner
    Reset --> Scanner
    Scanner --> Complete --> Cache
    Scanner --> Pending --> AutoClose --> PendingAST
    Cache --> Resolve
    PendingAST --> Resolve
    Resolve --> Result
    Result --> Defaults
    Defaults --> Evaluate
    Store --> Evaluate
    Evaluate --> Root --> RenderNode --> Boundary --> Component
```

Completed statements are cached. Only the newly appended suffix and current pending tail are reparsed
during normal model streaming. This avoids clearing the parser cache on every provider chunk.

## 7. Local interaction lifecycle

Most generated UI interaction does not require another Gemini request.

```mermaid
sequenceDiagram
    autonumber
    actor User
    participant Element as Generated component
    participant Hook as useTriggerAction
    participant Runtime as executeActions
    participant Store
    participant React as useSyncExternalStore
    participant Engine as Interpreter
    participant Renderer

    User->>Element: Click, select, type, or change value
    Element->>Hook: triggerAction(ActionPlan)
    Hook->>Runtime: Execute ordered action steps

    alt set or reset
        Runtime->>Store: Update llm.* state
        Store-->>React: Notify subscribers
        React->>Engine: Evaluate dynamic props with new snapshot
        Engine-->>Renderer: New concrete ElementNode tree
        Renderer-->>User: Updated UI without model round-trip
    else open_url
        Runtime->>Runtime: Allow only http or https
        Runtime-->>Element: Invoke external-action callback
    else send_message
        Runtime-->>Element: Invoke message-action callback
    end
```

Repeated parser updates do not overwrite a state value already changed by the user. Parsed declarations
only initialize missing `llm.*` keys.

## 8. Failure, timeout, and cancellation lifecycle

```mermaid
stateDiagram-v2
    [*] --> Validating
    Validating --> Rejected400: Invalid JSON or body
    Validating --> Rejected429: Concurrency limit
    Validating --> Streaming: Accepted

    Streaming --> Completed: Provider finishes
    Streaming --> TimedOut: CHAT_TIMEOUT_MS reached
    Streaming --> ClientCancelled: Browser disconnect or cancellation
    Streaming --> UpstreamFailed: Provider or transport error

    TimedOut --> ErrorEvent
    UpstreamFailed --> ErrorEvent
    ClientCancelled --> Closed
    ErrorEvent --> Closed
    Completed --> Closed
    Rejected400 --> [*]
    Rejected429 --> [*]
    Closed --> [*]
```

All terminal paths clear the timeout and release the process-local concurrency slot. The browser keeps
already received output and displays a separate error notice when an `error` event arrives.

## 9. Observability timeline

```mermaid
sequenceDiagram
    participant Route as Request lifecycle
    participant Log as Readable MorphicUI terminal log

    Route->>Log: request.accepted
    Route->>Log: model.request.started
    Route->>Log: model.first_text (first visible output)
    loop Every CHAT_LOG_PROGRESS_MS during a long stream
        Route->>Log: model.stream.progress
    end
    alt Success
        Route->>Log: model.stream.completed
    else Failure or timeout
        Route->>Log: model.stream.failed
    else Client cancellation
        Route->>Log: stream.cancelled
    end
```

### Metric interpretation

| Metric                                             | Meaning                                                                        |
| -------------------------------------------------- | ------------------------------------------------------------------------------ |
| `requestToModelMs`                               | Route entry through validation and stream setup, before the model call starts. |
| `modelSetupMs`                                   | Model-call start until the provider stream becomes available.                  |
| `timeToFirstChunkMs`                             | Model-call start until the first provider chunk.                               |
| `timeToFirstTextMs`                              | Model-call start until the first non-empty text chunk.                         |
| `streamOpenToFirstTextMs`                        | Provider-stream availability until the first non-empty text.                   |
| `streamingMs`                                    | Provider stream open until completion.                                         |
| `textStreamingMs`                                | First non-empty text until completion.                                         |
| `maxChunkGapMs`                                  | Largest pause observed between provider chunks.                                |
| `charsPerSecond`                                 | Output characters divided by the text-streaming duration.                      |
| `inputTokens`, `outputTokens`, `totalTokens` | Accumulated provider usage deltas.                                             |

The default `CHAT_LOG_FORMAT=pretty` groups each request into readable stages and an aligned completion
summary. Every wall-clock timestamp uses `Asia/Kolkata` and is labelled `IST`; structured timestamps
include the explicit `+05:30` offset. Elapsed latency fields such as `totalMs` and `textStreamingMs` use
a monotonic timer, so clock or timezone changes cannot distort them. Set `CHAT_LOG_FORMAT=json` for the
single-line structured records used by log collectors. Both formats contain sizes, timings,
identifiers, and safe error information; neither intentionally logs the API key, system-prompt
contents, or conversation contents.

## 10. Docker distribution lifecycle

> **TARGET — not yet implemented in the repository.** The current repository has no `Dockerfile` and
> `next.config.ts` does not yet enable standalone output.

```mermaid
flowchart LR
    Source[Source and bun.lock]
    Build[Bun dependency and Next.js build stages]
    Standalone[Next.js standalone server]
    Image[Versioned Docker image]
    Registry[Docker Hub repository]
    Pull[Friend pulls image]
    Env[Friend-owned runtime env file]
    Container[Non-root container on port 3000]
    Browser[Friend opens localhost]

    Source --> Build --> Standalone --> Image --> Registry --> Pull --> Container --> Browser
    Env -. runtime secrets only .-> Container
```

The intended lifecycle is:

1. Enable Next.js `output: "standalone"`.
2. Build dependencies and application in isolated Docker stages.
3. Copy only `public`, `.next/standalone`, and `.next/static` into the runtime image.
4. Push immutable version tags and an optional `latest` tag to Docker Hub.
5. Let each recipient supply their own `GOOGLE_API_KEY` at container runtime.
6. Never copy `.env.local` into the image or build context.

For a public shared deployment, put a reverse proxy, authentication, and external rate limiting in front
of the container. The current concurrency counter protects one process; it is not a distributed public
rate limiter.

## 11. Lifecycle invariants

- Prompt generation is server-side; prompt attachment occurs immediately before the model call.
- The generated UI prompt is cached for a module instance but transmitted on every UI request.
- The browser sends conversation messages, never the server system prompt or provider key.
- UI and text histories remain separate.
- Stream errors remain separate from generated content.
- A UI response is parsed incrementally; completed statements are cached.
- Local state interaction normally reevaluates the existing tree without calling Gemini.
- Every accepted request must release its timeout and concurrency slot on completion, error, or cancel.
- Docker images must receive secrets at runtime, never at image build or publication time.

## 12. Code evidence

| Lifecycle area                                 | Primary implementation                                                           |
| ---------------------------------------------- | -------------------------------------------------------------------------------- |
| Component prompt catalogue                     | `packages/elements/server.ts`                                                  |
| Prompt construction                            | `packages/engine/schema/prompt.ts`                                             |
| UI and text prompt selection                   | `app/api/chat/ui/route.ts`, `app/api/chat/text/route.ts`                     |
| Validation, SSE, cancellation, limits, metrics | `lib/chat-stream.ts`                                                           |
| System-message attachment and Gemini call      | `lib/agent.ts`                                                                 |
| Browser history and SSE consumption            | `app/hooks/useChat.ts`                                                         |
| Mode-specific rendering                        | `app/components/chat/MessageBubble.tsx`                                        |
| Incremental parsing                            | `packages/engine/parser/stream.ts`                                             |
| Dynamic evaluation and state                   | `packages/engine/runtime/interpreter.ts`, `packages/engine/runtime/state.ts` |
| Recursive React rendering                      | `packages/renderer/MorphicRenderer.tsx`, `packages/renderer/RenderNode.tsx`  |

## Evidence 2026-08-26

- **Environment:** local development and production build.
- **Scope:** prompt construction, direct Gemini streaming, typed SSE, parser/renderer behavior, state
  preservation, metrics, and documented Docker readiness.
- **Observed verification:** TypeScript passed; ESLint passed; 31 renderer/element gates passed; Next.js
  production build passed; live text and UI streaming requests completed.
-
