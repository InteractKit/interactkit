import { Entity, BaseEntity, Describe, Component, Hook, Init, type Remote } from '@interactkit/sdk';
import { StepB } from './step-b.js';

@Entity()
export class World extends BaseEntity {
  @Describe() describe() { return 'World'; }
  @Component() private stepB!: Remote<StepB>;

  @Hook(Init.Runner())
  async onInit() {
    console.log('[23] === Chain: World → B → C → D (all separate processes) ===');

    const r1 = await this.stepB.processB({ data: 'hello' });
    console.log(`[23] result: ${JSON.stringify(r1)}`);

    // Verify the data flowed through all 3 hops
    const hasChain = r1.result.includes('C(B(hello))');
    console.log(`[23] chain correct: ${hasChain}`);

    console.log('[23] === 20 sequential through chain ===');
    for (let i = 0; i < 20; i++) {
      await this.stepB.processB({ data: `seq-${i}` });
    }
    console.log('[23] 20 sequential done');

    console.log('[23] === 10 parallel through chain ===');
    const parallel = await Promise.all(
      Array.from({ length: 10 }, (_, i) => this.stepB.processB({ data: `par-${i}` }))
    );
    const allFinal = parallel.every(r => r.result.startsWith('FINAL:'));
    console.log(`[23] parallel: ${parallel.length} results, all final: ${allFinal}`);

    console.log('[23] DONE');
    setTimeout(() => process.exit(0), 200);
  }
}
