import { graph } from '../interactkit/.generated/graph.js';
import http from 'http';

// In-memory DB adapter for testing
const store = new Map<string, Record<string, unknown>>();
const memoryDb = {
  async get(id: string) { return store.get(id) ?? null; },
  async set(id: string, state: Record<string, unknown>) { store.set(id, state); },
  async delete(id: string) { store.delete(id); },
};

// We'll store a reference to the app so the HTTP server can call tools
let appRef: any;
let httpServer: http.Server;

const app = graph.configure({
  database: memoryDb,
  handlers: {
    Agent: {
      init: async (entity) => {
        console.log('  agent booted');
      },
      triggerHook: async (entity) => {
        // === 1. Send HTTP request to the worker's hook ===
        const res1 = await fetch('http://localhost:4555/hook', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ msg: 'hello' }),
        });
        const data1 = await res1.json() as { ok: boolean; count: number };
        console.log(`  ok http response: ${JSON.stringify(data1)}`);

        // === 2. Send another request ===
        const res2 = await fetch('http://localhost:4555/hook', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ msg: 'world' }),
        });
        const data2 = await res2.json() as { ok: boolean; count: number };
        console.log(`  ok second response count: ${data2.count}`);

        // === 3. Verify via tool call that requests were stored ===
        const requests = await entity.components.worker.getRequests();
        console.log(`  ok stored requests: ${requests.length}`);
        console.log(`  ok first request: ${requests[0]}`);

        console.log('  ok DONE');
        return { success: true };
      },
    },
    Worker: {
      init: async (entity) => {
        console.log(`  worker booted: ${entity.id}`);
      },
      receiveRequest: async (entity, input) => {
        entity.state.requests.push(`${input.method}:${input.path}:${input.body}`);
        console.log(`  worker received: ${input.method} ${input.path}`);
        return { ok: true, count: entity.state.requests.length };
      },
      getRequests: async (entity) => {
        return [...entity.state.requests];
      },
    },
  },
});

await app.boot();

// Start an HTTP server that acts as the hook endpoint for the worker
httpServer = http.createServer(async (req, res) => {
  if (req.url === '/hook') {
    let body = '';
    req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
    req.on('end', async () => {
      try {
        const result = await appRef.worker.receiveRequest({
          method: req.method!,
          path: req.url!,
          body,
        });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch (e: any) {
        res.writeHead(500);
        res.end(JSON.stringify({ error: e.message }));
      }
    });
  } else {
    res.writeHead(404);
    res.end('Not Found');
  }
});

appRef = app;

await new Promise<void>((resolve) => {
  httpServer.listen(4555, () => {
    console.log('  hook server listening on 4555');
    resolve();
  });
});

// Give the server a moment to be ready
await new Promise(r => setTimeout(r, 200));

// Trigger the agent to send HTTP requests
await app.agent.triggerHook();

httpServer.close();
await app.stop();
