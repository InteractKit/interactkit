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

server.post('/pipeline', async (req, res) => {
  const result = await app.pipeline.process({ topic: req.body.topic });
  res.json(result);
});

server.listen(3000, () => console.log('Content pipeline on http://localhost:3000'));
