import { graph } from '../interactkit/.generated/graph.js';

const store = new Map<string, Record<string, unknown>>();
const db = {
  async get(id: string) { return store.get(id) ?? null; },
  async set(id: string, s: Record<string, unknown>) { store.set(id, s); },
  async delete(id: string) { store.delete(id); },
};

const requestLog: string[] = [];

const app = graph.configure({
  database: db,
  handlers: {
    App: {
      fast: async (entity, input) => {
        entity.state.count++;
        return `ok:${input.msg}`;
      },
      slow: async () => {
        await new Promise(r => setTimeout(r, 5000));
        return 'should not reach';
      },
    },
  },
});

await app.boot();

await app.serve({
  http: {
    port: 4300,
    timeout: 2000,  // 2s timeout for slow test
    middleware: [
      // Logger middleware
      async (req) => {
        requestLog.push(`${req.method} ${req.path}`);
      },
      // Auth middleware
      async (req, res) => {
        const token = req.headers.authorization;
        if (req.path === '/_health') return;  // skip (but /_health skips middleware anyway)
        if (!token || token !== 'Bearer test-secret') {
          throw Object.assign(new Error('Unauthorized'), { statusCode: 401 });
        }
      },
      // Attach user info
      async (req) => {
        (req as any).userId = 'user-123';
      },
    ],
    routes: {
      'GET /log': async () => requestLog,
    },
  },
});

console.log('[35] server ready');
await new Promise(() => {});
