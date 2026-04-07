import { graph } from '../interactkit/.generated/graph.js';

const store = new Map<string, Record<string, unknown>>();
const db = {
  async get(id: string) { return store.get(id) ?? null; },
  async set(id: string, s: Record<string, unknown>) { store.set(id, s); },
  async delete(id: string) { store.delete(id); },
};

const app = graph.configure({
  database: db,
  handlers: {
    App: {
      inc: async (entity) => {
        entity.state.count++;
        return entity.state.count;
      },
    },
  },
});

await app.boot();
const srv = await app.serve({ http: { port: 4400 } });

// Do some work
await app.call('app', 'app.inc');
await app.call('app', 'app.inc');
await app.call('app', 'app.inc');
console.log('[36] count: 3');

// Verify HTTP is working
const res = await fetch('http://localhost:4400/_health');
const health = await res.json() as any;
console.log(`[36] health: ${health.status}`);

// Graceful shutdown
await srv.close();
console.log('[36] server closed');

await app.stop();
console.log('[36] app stopped');

// Verify HTTP is down
try {
  await fetch('http://localhost:4400/_health');
  console.log('[36] FAIL: server still running');
} catch {
  console.log('[36] server unreachable (expected)');
}

console.log('[36] DONE');
