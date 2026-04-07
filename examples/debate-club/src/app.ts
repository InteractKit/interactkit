import express from 'express';
import { graph } from '../interactkit/.generated/graph.js';
import { PrismaDatabaseAdapter } from '@interactkit/prisma';
import { DevObserver } from '@interactkit/sdk';

// ─── Configure ──────────────────────────────────────────

const app = graph.configure({
  database: new PrismaDatabaseAdapter({ url: 'file:./interactkit.db' }),
  observers: [new DevObserver()],
  timeout: 120_000,
});

// ─── Boot ───────────────────────────────────────────────
// All handlers defined via src="" in entities.xml — no inline handlers needed.

await app.boot();

// ─── HTTP API ───────────────────────────────────────────

const server = express();
server.use(express.json());

server.post('/debate', async (req, res) => {
  const { topic, rounds = 3 } = req.body;

  await app.debaterFor.configure({ name: 'Alice', side: 'for' });
  await app.debaterAgainst.configure({ name: 'Bob', side: 'against' });

  const results = [];
  let lastFor = '';
  let lastAgainst = '';

  for (let i = 0; i < rounds; i++) {
    const forArg = await app.debaterFor.argue({ topic, opponentArgument: lastAgainst });
    const againstArg = await app.debaterAgainst.argue({ topic, opponentArgument: lastFor });
    const score = await app.judge.scoreRound({ topic, forArgument: forArg, againstArgument: againstArg });
    results.push({ round: i + 1, for: forArg, against: againstArg, score });
    lastFor = forArg;
    lastAgainst = againstArg;
  }

  const verdict = await app.judge.finalVerdict({ topic, rounds: results.map(r => JSON.stringify(r)) });
  res.json({ topic, results, verdict });
});

server.listen(3000, () => console.log('Debate club on http://localhost:3000'));
