# Werewolf

Social deduction game with 6 LLM-controlled players (werewolves, seer, villagers). Optional human player support.

## Entity Tree

```
Game (BaseEntity)
├── player1: Player (LLMEntity)
│   └── PlayerMemory (BaseEntity)  -- @Component memory store
├── player2: Player (LLMEntity)
│   └── PlayerMemory (BaseEntity)
├── player3: Player (LLMEntity)
│   └── PlayerMemory (BaseEntity)
├── player4: Player (LLMEntity)
│   └── PlayerMemory (BaseEntity)
├── player5: Player (LLMEntity)
│   └── PlayerMemory (BaseEntity)
└── player6: Player (LLMEntity)
    └── PlayerMemory (BaseEntity)
```

Roles: 2 werewolves, 1 seer, 3 villagers (randomly assigned).

## SDK Features Demonstrated

- **Thinking loop**: Player.discuss(), Player.vote(), and Player.nightAction() use invoke() to push tasks to the built-in thinking loop. The LLM responds via the respond() tool.
- **Memory as @Component**: Each Player owns a PlayerMemory BaseEntity. Because it is a @Component, its tools (add, getAll, getRecent) are visible to the Player's LLM during the thinking loop.
- **@Describe()**: Player and PlayerMemory provide dynamic self-descriptions that include current role, personality, status, and recent memories.
- **@State**: Player persists name, role, personality, alive status, and known info. Game persists phase, round, and game log.
- **6 instances of one LLMEntity**: Each Player is configured with a unique name, personality, and secret role at game start.
- **Structured LLM output**: Players return JSON for votes and night actions; Game parses and validates targets.
- **Human-in-the-loop**: Optional human player joins via WebSocket, receiving blocking prompts for night actions, discussion, and voting.
- **HTTP + WebSocket hooks**: Real-time narration, speech, votes, and phase transitions pushed to all clients.

## How to Run

```bash
pnpm dev
```

Open http://localhost:3000 in your browser. WebSocket connects on port 3001.
