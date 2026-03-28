import { Entity, BaseEntity, Describe, Component, Hook, Init, type Remote } from '@interactkit/sdk';
import { ServiceA } from './service-a.js';
import { ServiceB } from './service-b.js';

@Entity()
export class Agent extends BaseEntity {
  @Describe() describe() { return 'Agent'; }
  @Component() private svcA!: Remote<ServiceA>;
  @Component() private svcB!: Remote<ServiceB>;

  @Hook(Init.Runner())
  async onInit() {
    console.log('[16] === Call both services ===');

    const a1 = await this.svcA.processA({ data: 'hello' });
    console.log(`[16] A: ${JSON.stringify(a1)}`);

    const b1 = await this.svcB.processB({ data: 'hello' });
    console.log(`[16] B: ${JSON.stringify(b1)}`);

    console.log('[16] === Interleaved calls ===');
    for (let i = 0; i < 10; i++) {
      await this.svcA.processA({ data: `msg-${i}` });
      await this.svcB.processB({ data: `msg-${i}` });
    }

    const statsA = await this.svcA.statsA();
    const statsB = await this.svcB.statsB();
    console.log(`[16] A calls: ${statsA.calls}, B calls: ${statsB.calls}`);

    console.log('[16] === Parallel to both ===');
    const results = await Promise.all([
      ...Array.from({ length: 15 }, (_, i) => this.svcA.processA({ data: `p-${i}` })),
      ...Array.from({ length: 15 }, (_, i) => this.svcB.processB({ data: `p-${i}` })),
    ]);
    const aResults = results.filter(r => r.from === 'A').length;
    const bResults = results.filter(r => r.from === 'B').length;
    console.log(`[16] parallel: A=${aResults}, B=${bResults}`);

    const finalA = await this.svcA.statsA();
    const finalB = await this.svcB.statsB();
    console.log(`[16] final: A=${finalA.calls}, B=${finalB.calls}`);

    console.log('[16] DONE');
    setTimeout(() => process.exit(0), 200);
  }
}
