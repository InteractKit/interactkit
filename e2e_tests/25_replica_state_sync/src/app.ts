import { graph } from '../interactkit/.generated/graph.js';

const store = new Map<string, Record<string, unknown>>();
const memoryDb = {
  async get(id: string) { return store.get(id) ?? null; },
  async set(id: string, state: Record<string, unknown>) { store.set(id, state); },
  async delete(id: string) { store.delete(id); },
};

const app = graph.configure({
  database: memoryDb,
  handlers: {
    ConfigStore: {
      set: async (entity, input) => {
        const settings = entity.state.settings as Array<{ key: string; value: string }>;
        const filtered = settings.filter((s: any) => s.key !== input.key);
        filtered.push({ key: input.key, value: input.value });
        entity.state.settings = filtered;
        entity.state.version++;
        return { version: entity.state.version };
      },
      get: async (entity, input) => {
        const settings = entity.state.settings as Array<{ key: string; value: string }>;
        const found = settings.find((s: any) => s.key === input.key);
        return { value: found?.value ?? null, version: entity.state.version };
      },
      getAll: async (entity) => {
        return { settings: [...(entity.state.settings as any[])], version: entity.state.version };
      },
    },
  },
});

await app.boot();

console.log('[25] === Write settings ===');

// Write 5 settings
for (let i = 0; i < 5; i++) {
  const r = await app.config.set({ key: `key-${i}`, value: `val-${i}` });
  console.log(`[25] set key-${i}: version=${r.version}`);
}

// Read back all settings
console.log('[25] === Read back ===');
const reads: any[] = [];
for (let i = 0; i < 10; i++) {
  const r = await app.config.get({ key: `key-${i % 5}` });
  reads.push(r);
}

const allFound = reads.every((r: any) => r.value !== null);
console.log(`[25] 10 reads, all found: ${allFound}`);

// Read values should be correct
for (let i = 0; i < 5; i++) {
  const r = await app.config.get({ key: `key-${i}` });
  const correct = r.value === `val-${i}`;
  if (!correct) console.log(`[25] MISMATCH: key-${i} expected val-${i} got ${r.value}`);
}

// Get all from store — should have all 5 settings
const all = await app.config.getAll();
console.log(`[25] getAll: ${all.settings.length} settings, version=${all.version}`);

// Update a key and verify
console.log('[25] === Update and verify sync ===');
await app.config.set({ key: 'key-0', value: 'UPDATED' });

// Read key-0 multiple times — should always get UPDATED
let updatedCount = 0;
for (let i = 0; i < 10; i++) {
  const r = await app.config.get({ key: 'key-0' });
  if (r.value === 'UPDATED') updatedCount++;
}
console.log(`[25] updated reads: ${updatedCount}/10 correct`);
console.log(`[25] synced: ${updatedCount === 10}`);

console.log('[25] DONE');
await app.stop();
