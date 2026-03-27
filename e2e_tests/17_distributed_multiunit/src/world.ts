import { Entity, BaseEntity, Describe, Component, Hook, Init } from '@interactkit/sdk';
import { Db } from './db.js';
import { Cache } from './cache.js';

@Entity()
export class World extends BaseEntity {
  @Describe() describe() { return 'World'; }
  @Component() private db!: Db;
  @Component() private cache!: Cache;

  @Hook(Init.Runner())
  async onInit() {
    console.log('[17] === 3 units: world + db + cache ===');

    // Write to both
    for (let i = 0; i < 15; i++) {
      await this.db.set({ key: `k${i}`, val: `v${i}` });
      await this.cache.put({ key: `k${i}`, val: `v${i}` });
    }

    const dbKeys = await this.db.keys();
    const cacheSize = await this.cache.size();
    console.log(`[17] db keys: ${dbKeys.length}, cache size: ${cacheSize}`);

    // Read back from both
    const dbVal = await this.db.get({ key: 'k7' });
    const cacheVal = await this.cache.fetch({ key: 'k7' });
    console.log(`[17] db k7: ${dbVal}, cache k7: ${cacheVal}`);
    console.log(`[17] match: ${dbVal === cacheVal}`);

    // Parallel writes to both services
    console.log('[17] === Parallel to db + cache ===');
    await Promise.all([
      ...Array.from({ length: 20 }, (_, i) => this.db.set({ key: `p${i}`, val: `pv${i}` })),
      ...Array.from({ length: 20 }, (_, i) => this.cache.put({ key: `p${i}`, val: `pv${i}` })),
    ]);
    const finalDb = (await this.db.keys()).length;
    const finalCache = await this.cache.size();
    console.log(`[17] final: db=${finalDb}, cache=${finalCache}`);

    console.log('[17] DONE');
    setTimeout(() => process.exit(0), 200);
  }
}
