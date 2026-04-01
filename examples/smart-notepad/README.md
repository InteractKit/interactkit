# Smart Notepad

LLM-powered note-taking app with automatic tagging, summarization, and search.

## Entity Tree

```
Notepad (BaseEntity)
├── NoteStore (BaseEntity)  -- persistent note storage with search
└── Tagger (LLMEntity)      -- auto-generates tags and summaries via GPT-4o-mini
    └── @Ref NoteStore
```

## SDK Features Demonstrated

- **Thinking loop**: Tagger is an LLMEntity -- invoke() pushes tasks to the built-in thinking loop, LLM responds via the respond() tool.
- **@Tool({ llmCallable: true })**: Tagger's tagNote and findRelated are marked llmCallable so the LLM can call them during its thinking loop. suggestTags is not llmCallable (external only).
- **@Component / @Ref**: Notepad owns NoteStore and Tagger as components. Tagger holds a @Ref to NoteStore so it can read/write notes -- ref tools are always visible to the LLM.
- **@State**: NoteStore persists its notes array across restarts.
- **@Describe()**: Both NoteStore and Tagger provide dynamic self-descriptions for the LLM context.
- **HTTP + WebSocket hooks**: Notepad serves a UI on port 3000 and handles real-time messages on port 3001.

## How to Run

```bash
pnpm dev
```

Open http://localhost:3000 in your browser. WebSocket connects on port 3001.
