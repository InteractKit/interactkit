# Debate Club

Two LLM debaters argue a topic across multiple rounds while a judge scores each round.

## Entity Tree

```
Arena (BaseEntity)
├── debaterFor: Debater (LLMEntity)      -- "Aristotle", argues FOR the topic
├── debaterAgainst: Debater (LLMEntity)  -- "Socrates", argues AGAINST the topic
└── Judge (LLMEntity)                    -- impartial judge, scores each round
```

## SDK Features Demonstrated

- **Thinking loop**: Debater.argue() and Judge.scoreRound() use invoke() to push tasks into the built-in thinking loop. The LLM responds via the respond() tool.
- **Multiple instances of one LLMEntity**: Two Debater instances with different @State (name, side, style) configured at init to create distinct personas.
- **Structured LLM output**: Judge returns parsed JSON scores (forScore, againstScore, commentary).
- **@Describe()**: Each entity provides a dynamic self-description reflecting its current persona and role.
- **@State**: Arena persists its debate history; Debater stores its configured identity.
- **Multi-round orchestration**: Back-and-forth arguments with per-round scoring and a final verdict.
- **HTTP + WebSocket hooks**: Real-time updates for each argument, score, and verdict.

## How to Run

```bash
pnpm dev
```

Open http://localhost:3000 in your browser. WebSocket connects on port 3001.
