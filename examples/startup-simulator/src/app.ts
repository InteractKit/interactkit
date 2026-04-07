import express from 'express';
import { graph } from '../interactkit/.generated/graph.js';
import { PrismaDatabaseAdapter } from '@interactkit/prisma';
import { DevObserver } from '@interactkit/sdk';

// All tool handlers defined via src="" in entities.xml.
// Shared resources: autotools. AI team: llm-callable tools auto-invoke thinking loop.

const app = graph.configure({
  database: new PrismaDatabaseAdapter({ url: 'file:./interactkit.db' }),
  timeout: 120_000,
});

await app.boot();

const server = express();
server.use(express.json());

server.post('/launch', async (req, res) => {
  const result = await app.startup.launch({ vision: req.body.vision });
  res.json({ result });
});

server.post('/message', async (req, res) => {
  const result = await app.startup.message(req.body);
  res.json({ result });
});

server.get('/status', async (_req, res) => {
  const status = await app.startup.status();
  res.json(status);
});

server.listen(3000, () => console.log('Startup simulator on http://localhost:3000'));
