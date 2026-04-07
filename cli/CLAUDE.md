# @interactkit/cli

CLI tool for InteractKit projects. XML compiler, scaffolding, building, and running. Uses commander.js.

## Commands

| Command | What it does |
|---------|-------------|
| `interactkit init <name> [--llm]` | Scaffold new project (XML entities, tools dir, src/app.ts, tsconfig) |
| `interactkit compile [-o outDir]` | Compile XML entity graph to typed TypeScript (default: `./interactkit/.generated`) |
| `interactkit build [-o outDir]` | Compile XML + run `tsc --noEmit` |
| `interactkit dev [-o outDir] [-e entry]` | Compile + run app via `tsx`, watch `interactkit/` and `src/` for changes (auto-restart) |
| `interactkit start [-e entry]` | Run the built app via `tsx` (default entry: `./src/app.ts`) |

---

## Compiler Pipeline

```
XML files (interactkit/*.xml)
  │
  ├─ 1. Parse XML → GraphIR         (xml/parser.ts)
  ├─ 2. Fetch remote schemas         (compiler/index.ts — for entities with remote attr)
  ├─ 3. Expand autotools → ToolIR    (expand-autotools.ts)
  ├─ 3b. Expand long-term-memory     (expand-ltm.ts — for type="long-term-memory" entities)
  ├─ 4. Validate                     (validator/index.ts)
  ├─ 5. MCP tool discovery           (mcp/discovery.ts — for type="mcp" entities)
  ├─ 6. Infer peerVisible refs       (peer-visible.ts)
  └─ 7. Generate output files        (generator/)
         ├─ tree.ts      — EntityNode tree (runtime structure)
         ├─ registry.ts  — Zod schemas for state + tool I/O
         ├─ types.ts     — TS interfaces (state, input/output, proxies, handler builders)
         ├─ graph.ts     — InteractKitGraph class + typed App subclass
         └─ handlers.ts  — imports from src attributes (only if any tool has src)
```

---

## Intermediate Representation (IR)

All compiler stages operate on `GraphIR` (from `compiler/ir.ts`).

### Key IR types

| Type | Purpose |
|------|---------|
| `GraphIR` | Root: `{ version, root?, entities[] }` |
| `EntityIR` | Entity definition: name, type (base/llm/mcp/conversation-context/long-term-memory), state, fieldGroups, secrets, components, refs, tools, autotools, streams, executor?, thinkingLoop?, mcp? |
| `FieldIR` | State field: name, type (string/number/boolean/array/object/record), description, default, optional, configurable, items?, values?, validate?, children[] |
| `FieldGroupIR` | Named array of typed items with a key field (for autotools) |
| `ToolIR` | Tool: name, description, llmCallable, peerVisible, src?, auto?, input[], output |
| `AutoToolIR` | Auto CRUD tool: name, on (fieldGroup), op (create/read/update/delete/list/search/count), key? |
| `ParamIR` | Tool parameter: name, type, optional, items?, values?, validate?, children[] |
| `ValidateIR` | Validation constraints: minLength, maxLength, pattern, format, min, max, integer, minItems, maxItems, enum |
| `ExecutorIR` | LLM config: provider (openai/anthropic/google/ollama), model, temperature?, maxTokens? |
| `ThinkingLoopIR` | LLM loop config: intervalMs, softTimeoutMs, hardTimeoutMs, contextWindow, innerMonologue, maxSleepTicks, minIntervalMs, maxIntervalMs, maxDefers |
| `McpIR` | MCP config: toolPrefix?, connectTimeout, callTimeout, retry, maxRetries, tools?, transport (stdio/http/sse) |
| `RefIR` | Ref: name, entity, inferred? (auto-added from peerVisible), visibleTools? |
| `SecretIR` | Secret: name, description?, env? |

---

## XML Parsing (xml/parser.ts)

Uses `fast-xml-parser`. Parses `<graph>` root with `<entity>` children. Attributes are read with `@_` prefix. Elements that can repeat (entity, field, component, tool, param, etc.) are forced into arrays.

### Entity types

| XML `type` | Meaning |
|------------|---------|
| `base` | Standard entity — tools are user-implemented handlers |
| `llm` | LLM entity — requires `<executor>`, gets auto invoke handler |
| `mcp` | MCP entity — requires `<mcp>` transport, tools discovered at compile time |
| `conversation-context` | Shared LLM conversation context |
| `long-term-memory` | RAG / vector store entity |

---

## Expand Autotools (expand-autotools.ts)

Converts `<autotool>` elements into full `ToolIR` entries. Each autotool references a `fieldGroup` and an operation. The expander generates appropriate input/output params from the fieldGroup's fields and key.

Example: `<autotool name="addTask" on="tasks" op="create" />` generates a create tool with the tasks fieldGroup's fields as input params and string (id) as output.

## Expand Long-Term Memory (expand-ltm.ts)

For entities with `type="long-term-memory"`, the compiler auto-generates three tools:

| Tool | Input | Output |
|------|-------|--------|
| `memorize` | `{ content: string, metadata?: Record<string, unknown> }` | `string[]` (IDs) |
| `recall` | `{ query: string, k?: number, filter?: Record<string, unknown> }` | `ScoredDocument[]` |
| `forget` | `{ ids?: string[], filter?: Record<string, unknown> }` | `void` |

Typed signatures are generated as `{Entity}MemorizeInput`, `{Entity}RecallInput`, `{Entity}ForgetInput`. All tools are marked `peerVisible="true"` so they are automatically visible to LLM siblings/parents. No `src` attribute needed -- handlers are auto-registered by the SDK runtime when `vectorStore` is configured.

---

## Validation (validator/index.ts)

Returns `{ errors, warnings }`. Errors fail the build, warnings are printed.

**Checks:**
- Entity names must be PascalCase
- Components reference existing entities, no duplicates
- Refs reference existing entities that are siblings (same parent)
- No component cycles (DFS cycle detection)
- No duplicate entity names
- State: no duplicates, array fields need `items`, record fields need `values`, object fields need children, validation constraints match field type
- Tools: no duplicates, reserved names (init/describe/invoke) rejected, src must be relative path
- Streams: no duplicates
- LLM: type="llm" must have `<executor>`, non-LLM must not have `<executor>` or `<thinking-loop>`
- MCP: type="mcp" must have `<mcp>`, non-MCP must not have `<mcp>`

**Warning:** tool without `src` on non-LLM entity -- must be provided via handlers at runtime.

---

## The `src` Attribute on Tools

Tools can have a `src` attribute pointing to a handler implementation file (relative to `interactkit/` dir):

```xml
<tool name="hello" description="Say hello" src="tools/hello.ts">
```

The handlers generator (`generator/handlers.ts`) collects all tools with `src` and generates `handlers.ts`:

```typescript
import _h0 from '../tools/hello.js';
export const handlers: HandlersConfig = {
  MyEntity: { hello: _h0 },
};
```

The generated `graph.ts` merges src-defined handlers with user-provided handlers (user overrides take precedence).

Handler signature: `(entity: Entity, input?: TypedInput) => Promise<TypedOutput>`

---

## peerVisible Ref Inference (peer-visible.ts)

Tools with `peerVisible="true"` are automatically accessible to sibling entities. The compiler auto-adds refs from all sibling entities to the entity with peerVisible tools. Only the peerVisible tool names are tracked on the inferred ref (`visibleTools`). Runs after validation, mutates IR in place.

---

## Remote Entity Schema Fetching (compiler/index.ts)

Entities with a `remote` attribute get their schemas fetched at compile time from `remote_url/schema`. The fetched schema populates the entity's tools, streams, components, and executor config. Child entities of the remote root are also added to the graph.

---

## MCP Tool Discovery (mcp/discovery.ts)

For `type="mcp"` entities, connects to the MCP server at compile time and discovers available tools. Supports stdio, HTTP (StreamableHTTP), and SSE transports. Tools are filtered by the `tools` attribute if specified. Tool names are prefixed with `toolPrefix` if set. Discovered tools are injected as `ToolIR` entries with `llmCallable: true`.

---

## Generated Files

### tree.ts
EntityNode tree -- the runtime's source of truth for entity structure. Nested components, state defaults, method event names, stream names, refs, executor config.

### registry.ts
Zod schemas for entity state and tool input/output validation.

### types.ts
TypeScript interfaces:
- `{Entity}State` -- state shape per entity
- `{Entity}{Tool}Input` / `{Entity}{Tool}Output` -- tool I/O types
- `{Entity}Entity` -- typed Entity with state (`Entity & { state: EntityState }`)
- `{Entity}Proxy` -- typed proxy for external access (methods return promises, components return child proxies)
- `{Entity}HandleBuilder` -- fluent handler registration (app.EntityName.method(fn))
- `AddHandlerOverloads` / `OnOverloads` -- typed overloads for app.addHandler/on
- `HandlersConfig` -- typed config for handlers map
- FieldGroup item interfaces (e.g. `AgentTasksItem`)
- RefProxy interfaces (for inferred peerVisible refs with limited tools)

### graph.ts
- `InteractKitGraph` class extending `InteractKitRuntime` -- constructed with generated tree + registry
- `App` class extending `InteractKitApp` -- typed handler builders, typed proxy getters, typed addHandler/on overrides
- `export const graph` -- singleton instance

### handlers.ts (conditional)
Only generated if any tool has a `src` attribute. Imports handler functions and exports a typed `HandlersConfig` object.

---

## Type Inference

- **FieldGroup items**: fieldGroup fields become item interface properties. The key field is always `string`.
- **Enum unions**: `validate.enum` on a string field generates a union type (`'a' | 'b' | 'c'`).
- **Void output**: `<output type="void">` generates `void` return type on the proxy.
- **RefProxy**: inferred refs with `visibleTools` generate a proxy interface exposing only those tools.
- **Array items**: `type="array" items="string"` becomes `string[]`. Object items reference the fieldGroup item type.
- **Record values**: `type="record" values="number"` becomes `Record<string, number>`.
- **Nested objects**: `type="object"` with children generates inline `{ field: type }` types.

---

## File Structure

```
src/
  index.ts                        # commander.js entry point (compile, build, dev, start, init commands)
  compiler/
    index.ts                      # Full pipeline orchestrator: parse → fetch remote → expand → validate → MCP → infer refs → generate → write
    ir.ts                         # Intermediate Representation types (GraphIR, EntityIR, ToolIR, etc.)
    xml/
      parser.ts                   # XML → GraphIR (fast-xml-parser)
    expand-autotools.ts           # AutoToolIR → ToolIR expansion from fieldGroups
    peer-visible.ts               # Infer refs from peerVisible tools
    validator/
      index.ts                    # Semantic validation (naming, refs, cycles, state, tools, LLM, MCP)
    generator/
      index.ts                    # Orchestrates all generators, returns { filename: content }
      tree.ts                     # EntityNode tree generator
      registry.ts                 # Zod schema registry generator
      types.ts                    # TypeScript interface generator (state, I/O, proxies, builders)
      graph.ts                    # InteractKitGraph + App class generator
      handlers.ts                 # Handler imports from src attributes
    mcp/
      discovery.ts                # Compile-time MCP tool discovery (stdio, HTTP, SSE)
```

## Key Design Rules

- CLI is a **separate package** from the SDK -- avoids bloating SDK with fast-xml-parser and MCP dependencies
- SDK exports runtime types only -- CLI handles build tooling
- Codegen output goes to `interactkit/.generated/` (gitignored)
- XML files live in `interactkit/` at the project root
- Handler source files live in `interactkit/tools/` (or any path under `interactkit/`)
- Entity names must be PascalCase -- types are auto-derived as kebab-case
- Multiple XML files are merged into a single GraphIR (entities from all files combined)

## Dependencies

| Package | Role |
|---------|------|
| `commander` | CLI argument parsing |
| `fast-xml-parser` | XML → JS object parsing |
| `@modelcontextprotocol/sdk` | MCP client for compile-time tool discovery |
