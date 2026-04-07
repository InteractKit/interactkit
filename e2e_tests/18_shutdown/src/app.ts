import { graph } from '../interactkit/.generated/graph.js';
const store = new Map<string, Record<string, unknown>>();
const db = { async get(id: string) { return store.get(id) ?? null; }, async set(id: string, s: Record<string, unknown>) { store.set(id, s); }, async delete(id: string) { store.delete(id); } };

const app = graph.configure({ database: db, handlers: {
  Worker: {
    work: async (e, input) => { e.state.tasks = (e.state.tasks as number) + 1; return e.state.tasks; },
  },
}});
await app.boot();

console.log('[18] booted');
await app.worker.work({ task: 'a' });
await app.worker.work({ task: 'b' });
console.log('[18] work done');
console.log('[18] sending SIGINT');

// Self-SIGINT to test graceful shutdown
setTimeout(() => {
  process.kill(process.pid, 'SIGINT');
}, 200);
