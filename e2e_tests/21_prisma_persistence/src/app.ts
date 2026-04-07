import { graph } from '../interactkit/.generated/graph.js';
import { PrismaDatabaseAdapter } from '@interactkit/prisma';

const mode = process.argv[2] ?? 'first';
const dbUrl = process.env.DATABASE_URL ?? 'file:./interactkit.db';

const app = graph.configure({
  database: new PrismaDatabaseAdapter({ url: dbUrl }),
  handlers: {
    Agent: {
      setCount: async (entity, input) => {
        entity.state.count = input.value;
        return {};
      },
      addLogs: async (entity, input) => {
        for (const e of input.entries) entity.state.log.push(e);
        return {};
      },
      getState: async (entity) => {
        return { count: entity.state.count, log: [...entity.state.log] };
      },
    },
  },
});

await app.boot();

if (mode === 'first') {
  console.log('[21] FIRST BOOT');
  await app.agent.setCount({ value: 42 });
  await app.agent.addLogs({ entries: ['first', 'second', 'third'] });
  const s = await app.agent.getState();
  console.log(`[21] set count=${s.count}, log=${s.log.length}`);
  // Wait for state flush
  await new Promise(r => setTimeout(r, 500));
  console.log('[21] FIRST_DONE');
} else {
  const s = await app.agent.getState();
  console.log(`[21] REBOOT: count=${s.count}, log=${JSON.stringify(s.log)}`);
  console.log('[21] REBOOT_DONE');
}

await app.stop();
