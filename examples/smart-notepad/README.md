# Smart Notepad

LLM-powered note-taking app with search and an autonomous notes manager.

## Entity Tree

```
Notepad (BaseEntity)
├── NoteStore (BaseEntity)      -- persistent note storage with search
└── NotesManager (LLMEntity)    -- LLM brain that manages notes via NoteStore
    └── @Ref NoteStore
```

## SDK Features Demonstrated

- **Thinking loop**: NotesManager is an LLMEntity -- it autonomously reasons about notes using the built-in thinking loop.
- **@Component / @Ref**: Notepad owns NoteStore and NotesManager as components. NotesManager holds a @Ref to NoteStore so it can read/write notes -- ref tools are always visible to the LLM.
- **@State**: NoteStore persists its notes array across restarts.
- **@Stream**: NotesManager emits notifications upstream to Notepad, which broadcasts them to connected WebSocket clients as toasts.
- **@Describe()**: Both NoteStore and NotesManager provide dynamic self-descriptions for the LLM context.
- **HTTP + WebSocket hooks**: Notepad serves a UI on port 3000 and handles real-time messages on port 3001.

## How to Run

```bash
pnpm dev
```

Open http://localhost:3000 in your browser. WebSocket connects on port 3001.

## Screenshots

Type a messy note and the LLM cleans it up, tags it, and saves it automatically.

| Before | After |
|--------|-------|
| ![Before](images/before.png) | ![After](images/after.png) |
