import express from 'express';
import { graph } from '../interactkit/.generated/graph.js';
import { PrismaDatabaseAdapter } from '@interactkit/prisma';
import { DevObserver } from '@interactkit/sdk';

// All tool handlers defined via src="" in entities.xml.
// PlayerMemory: add/getAll = autotools. Player: discuss/vote/nightAction = LLM auto-invoke.

const app = graph.configure({
  database: new PrismaDatabaseAdapter({ url: 'file:./interactkit.db' }),
  observers: [new DevObserver()],
  timeout: 120_000,
});

await app.boot();

const server = express();
server.use(express.json());

server.get('/status', async (_req, res) => {
  const status = await app.game.getStatus();
  res.json(status);
});

server.listen(3000, () => console.log('Werewolf game on http://localhost:3000'));
