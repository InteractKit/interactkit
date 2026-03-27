import { Entity, BaseEntity, Describe, Component, Hook, Init } from '@interactkit/sdk';
import { ConfigStore } from './config-store.js';

@Entity()
export class Agent extends BaseEntity {
  @Describe() describe() { return 'Agent'; }
  @Component() private config!: ConfigStore;

  @Hook(Init.Runner())
  async onInit() {
    console.log('[25] === Write to one replica, read from others ===');

    // Write 5 settings — each write goes to one replica via competing consumer
    for (let i = 0; i < 5; i++) {
      const r = await this.config.set({ key: `key-${i}`, value: `val-${i}` });
      console.log(`[25] set key-${i}: version=${r.version}, pid=${r.pid}`);
    }

    // Wait for state sync broadcast to propagate
    await new Promise(r => setTimeout(r, 200));

    // Read back — reads go to random replicas via competing consumer
    // After sync, all replicas should have the same settings
    console.log('[25] === Read back from pool ===');
    const reads: any[] = [];
    for (let i = 0; i < 10; i++) {
      const r = await this.config.get({ key: `key-${i % 5}` });
      reads.push(r);
    }

    const readPids = new Set(reads.map(r => r.pid));
    const allFound = reads.every(r => r.value !== null);
    console.log(`[25] 10 reads from ${readPids.size} replicas, all found: ${allFound}`);

    // Read values should be correct regardless of which replica responds
    for (let i = 0; i < 5; i++) {
      const r = await this.config.get({ key: `key-${i}` });
      const correct = r.value === `val-${i}`;
      if (!correct) console.log(`[25] MISMATCH: key-${i} expected val-${i} got ${r.value} from pid ${r.pid}`);
    }

    // Get all from one replica — should have all 5 settings
    const all = await this.config.getAll();
    console.log(`[25] getAll: ${all.settings.length} settings, version=${all.version}, pid=${all.pid}`);

    // Update a key and verify other replicas see it
    console.log('[25] === Update and verify sync ===');
    await this.config.set({ key: 'key-0', value: 'UPDATED' });
    await new Promise(r => setTimeout(r, 200));

    // Read key-0 multiple times — should always get UPDATED
    let updatedCount = 0;
    for (let i = 0; i < 10; i++) {
      const r = await this.config.get({ key: 'key-0' });
      if (r.value === 'UPDATED') updatedCount++;
    }
    console.log(`[25] updated reads: ${updatedCount}/10 correct`);
    console.log(`[25] synced: ${updatedCount === 10}`);

    console.log('[25] DONE');
    setTimeout(() => process.exit(0), 200);
  }
}
