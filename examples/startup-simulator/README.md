# Startup Simulator

Watch an AI team (CEO, CTO, Designer, Developer) build a startup from scratch. Give them an idea and they autonomously plan, design, and code it.

## Entity Tree

```
Startup (BaseEntity)
├── Whiteboard (BaseEntity)     -- shared vision/plan board
├── TaskBoard (BaseEntity)      -- task management with status workflow
├── SlackChannel (BaseEntity)   -- team communication
├── Codebase (BaseEntity)       -- virtual filesystem for code
├── DesignSystem (BaseEntity)   -- wireframes, components, palettes
├── CEO (LLMEntity)             -- sets vision, strategic priorities
├── CTO (LLMEntity)             -- architecture, task breakdown, code review
├── Designer (LLMEntity)        -- wireframes (SVG), UI specs, color palettes
└── Developer (LLMEntity)       -- picks tasks, writes code, runs tests
```

## SDK Features Demonstrated

- **@ThinkingLoop with alwaysThink**: Each team member has an autonomous thinking loop (CEO 15s, CTO/Designer 12s, Developer 10s) that continuously monitors shared resources and takes action without external prompts.
- **Shared resources via @Ref**: All LLM agents reference shared BaseEntity resources (Whiteboard, TaskBoard, SlackChannel, etc.) to coordinate asynchronously -- no direct agent-to-agent calls needed.
- **@Component ownership**: Startup owns all 9 sub-entities as components.
- **@State**: Each agent persists role-specific state (vision, architecture, techStack, currentTaskId, filesWritten, etc.).
- **@Describe()**: Dynamic self-descriptions that include current state for LLM context.
- **Multiple LLMEntity types**: Four distinct LLMEntity classes with different tools, states, and thinking loop intervals working together.
- **Tool-driven coordination**: Agents write to shared resources (Whiteboard posts, TaskBoard tasks, Slack messages, Codebase files) which other agents discover during their thinking loops.

## How to Run

```bash
pnpm dev
```

Open the Observer dashboard to watch the agents collaborate in real time.

## Screenshot

![Startup Simulator - Observer Dashboard](images/image.png)
