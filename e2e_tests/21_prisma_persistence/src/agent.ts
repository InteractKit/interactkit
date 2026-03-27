import { Entity, BaseEntity, Describe, State, Tool, Hook, Init, PrismaDatabaseAdapter } from '@interactkit/sdk';

@Entity({ database: PrismaDatabaseAdapter })
export class Agent extends BaseEntity {
  @Describe() describe() { return `Agent: ${this.count} ops, ${this.log.length} logs`; }
  @State({ description: 'Counter' }) private count = 0;
  @State({ description: 'Log' }) private log: string[] = [];

  @Hook(Init.Runner())
  async onInit() {
    if (this.count > 0) {
      console.log(`[21] REBOOT: count=${this.count}, log=${JSON.stringify(this.log)}`);
      console.log('[21] REBOOT_DONE');
      setTimeout(() => process.exit(0), 100);
      return;
    }

    console.log('[21] FIRST BOOT');
    await this.setCount({ value: 42 });
    await this.addLogs({ entries: ['first', 'second', 'third'] });
    console.log(`[21] set count=${this.count}, log=${this.log.length}`);

    // Wait for reactive state flush
    await new Promise(r => setTimeout(r, 500));
    console.log('[21] FIRST_DONE');
    setTimeout(() => process.exit(0), 100);
  }

  @Tool({ description: 'Set count' })
  async setCount(input: { value: number }) { this.count = input.value; }

  @Tool({ description: 'Add logs' })
  async addLogs(input: { entries: string[] }) {
    for (const e of input.entries) this.log.push(e);
  }
}
