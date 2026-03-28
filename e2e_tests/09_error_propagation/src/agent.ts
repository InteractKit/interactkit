import { Entity, BaseEntity, Describe, Component, Hook, Init, type Remote } from '@interactkit/sdk';
import { Broken } from './broken.js';

@Entity()
export class Agent extends BaseEntity {
  @Describe() describe() { return 'Agent'; }
  @Component() private broken!: Remote<Broken>;

  @Hook(Init.Runner())
  async onInit() {
    console.log('[09] === Error from tool ===');
    try {
      await this.broken.fail({ msg: 'test-error' });
      console.error('[09] FAIL: should have thrown');
      process.exit(1);
    } catch (e: any) {
      console.log(`[09] caught: ${e.message}`);
      const hasMsg = e.message.includes('BOOM: test-error');
      console.log(`[09] has correct message: ${hasMsg}`);
    }

    console.log('[09] === Multiple errors ===');
    let errorCount = 0;
    for (let i = 0; i < 5; i++) {
      try {
        await this.broken.fail({ msg: `err-${i}` });
      } catch (e: any) {
        if (e.message.includes(`err-${i}`)) errorCount++;
      }
    }
    console.log(`[09] caught ${errorCount}/5 errors with correct messages`);

    console.log('[09] === Error doesn\'t break subsequent calls ===');
    try { await this.broken.fail({ msg: 'first' }); } catch {}
    try {
      await this.broken.failTyped({ code: 404 });
    } catch (e: any) {
      console.log(`[09] second error: ${e.message}`);
    }

    console.log('[09] === Parallel errors ===');
    const results = await Promise.allSettled(
      Array.from({ length: 10 }, (_, i) => this.broken.fail({ msg: `par-${i}` }))
    );
    const rejections = results.filter(r => r.status === 'rejected');
    console.log(`[09] parallel: ${rejections.length}/10 rejected`);

    console.log('[09] DONE');
    setTimeout(() => process.exit(0), 100);
  }
}
