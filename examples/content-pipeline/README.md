# Content Pipeline

Multi-agent content creation pipeline: research, write, edit.

## Entity Tree

```
Pipeline (BaseEntity)
├── Researcher (LLMEntity)  -- researches topics, produces structured notes
├── Writer (LLMEntity)      -- writes articles from research notes
└── Editor (LLMEntity)      -- polishes drafts for clarity and grammar
```

## SDK Features Demonstrated

- **Thinking loop**: Each LLMEntity stage (Researcher, Writer, Editor) uses invoke() to push a task into the built-in thinking loop. The LLM completes the task via the respond() tool.
- **Sequential multi-agent orchestration**: Pipeline (a BaseEntity) calls each LLMEntity in order -- research, then write, then edit -- passing output forward.
- **@Component**: Pipeline owns all three LLM agents as components.
- **@Describe()**: Each agent provides a self-description used in LLM context.
- **@State**: Pipeline persists its job list with status transitions (researching -> writing -> editing -> done).
- **HTTP + WebSocket hooks**: Real-time progress updates pushed to the client as each stage completes.

## How to Run

```bash
pnpm dev
```

Open http://localhost:3000 in your browser. WebSocket connects on port 3001.

## Screenshot

![Content Pipeline in action](images/image.png)
