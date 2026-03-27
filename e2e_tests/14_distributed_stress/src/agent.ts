import { Entity, BaseEntity, Describe, Component, Hook, Init } from '@interactkit/sdk';
import { Memory } from './memory.js';

@Entity()
export class Agent extends BaseEntity {
  @Describe() describe() { return 'Agent'; }
  @Component() private memory!: Memory;

  @Hook(Init.Runner())
  async onInit() {
    console.log('[14] === 200 sequential stores via Redis ===');
    for (let i = 0; i < 200; i++) {
      await this.memory.store({ text: `seq-${i}` });
    }
    const seqCount = await this.memory.count();
    console.log(`[14] sequential: ${seqCount}`);

    console.log('[14] === 100 parallel stores via Redis ===');
    await Promise.all(
      Array.from({ length: 100 }, (_, i) => this.memory.store({ text: `par-${i}` }))
    );
    const parCount = await this.memory.count();
    console.log(`[14] after parallel: ${parCount}`);

    console.log('[14] === Rapid fire 50 reads ===');
    const reads = await Promise.all(
      Array.from({ length: 50 }, () => this.memory.count())
    );
    const allSame = reads.every(r => r === parCount);
    console.log(`[14] 50 parallel reads consistent: ${allSame}`);

    console.log('[14] === Verify data integrity ===');
    const all = await this.memory.getAll();
    const hasSeq0 = all.includes('seq-0');
    const hasSeq199 = all.includes('seq-199');
    const hasPar0 = all.includes('par-0');
    const hasPar99 = all.includes('par-99');
    console.log(`[14] seq-0:${hasSeq0} seq-199:${hasSeq199} par-0:${hasPar0} par-99:${hasPar99}`);

    console.log('[14] DONE');
    setTimeout(() => process.exit(0), 200);
  }
}
