import { Entity, BaseEntity, Describe, State, Tool, Hook, Init } from '@interactkit/sdk';

@Entity()
export class Agent extends BaseEntity {
  @Describe()
  describe() { return `Agent: ${this.count} ops, ${this.log.length} logs`; }

  @State({ description: 'Counter' })
  private count = 0;

  @State({ description: 'Operation log' })
  private log: string[] = [];

  @Hook(Init.Runner())
  async onInit() {
    console.log('[01] === Sequential tool calls ===');

    // 50 sequential increments
    for (let i = 1; i <= 50; i++) {
      const r = await this.increment({ amount: 1 });
      if (r.count !== i) {
        console.error(`[01] FAIL: expected count ${i}, got ${r.count}`);
        process.exit(1);
      }
    }
    console.log(`[01] 50 sequential increments: count=${await this.getCount()}`);

    // Increment by various amounts
    await this.increment({ amount: 10 });
    await this.increment({ amount: 25 });
    await this.increment({ amount: -5 });
    const finalCount = await this.getCount();
    console.log(`[01] after +10,+25,-5: count=${finalCount}`);

    console.log('[01] === Parallel tool calls ===');

    // 20 parallel increments
    const promises = Array.from({ length: 20 }, () => this.increment({ amount: 1 }));
    const results = await Promise.all(promises);
    const parallelCount = await this.getCount();
    console.log(`[01] 20 parallel increments: count=${parallelCount}`);

    console.log('[01] === Logging tool ===');

    // Log entries
    await this.addLog({ entry: 'first' });
    await this.addLog({ entry: 'second' });
    await this.addLog({ entry: 'third' });
    const logs = await this.getLogs();
    console.log(`[01] logs: ${JSON.stringify(logs)}`);

    console.log('[01] === Return types ===');

    const obj = await this.returnObject();
    console.log(`[01] object: ${JSON.stringify(obj)}`);
    const arr = await this.returnArray();
    console.log(`[01] array: ${JSON.stringify(arr)}`);
    const str = await this.returnString();
    console.log(`[01] string: ${str}`);
    const num = await this.returnNumber();
    console.log(`[01] number: ${num}`);
    const nul = await this.returnNull();
    console.log(`[01] null: ${nul}`);

    console.log('[01] === Describe reflects state ===');
    const desc = this.describe();
    console.log(`[01] describe: ${desc}`);

    console.log('[01] DONE');
    setTimeout(() => process.exit(0), 100);
  }

  @Tool({ description: 'Increment counter' })
  async increment(input: { amount: number }) {
    this.count += input.amount;
    return { count: this.count };
  }

  @Tool({ description: 'Get count' })
  async getCount() { return this.count; }

  @Tool({ description: 'Add log' })
  async addLog(input: { entry: string }) {
    this.log.push(input.entry);
    return { total: this.log.length };
  }

  @Tool({ description: 'Get logs' })
  async getLogs() { return this.log; }

  @Tool({ description: 'Return object' })
  async returnObject() { return { nested: { deep: true }, arr: [1, 2, 3] }; }

  @Tool({ description: 'Return array' })
  async returnArray() { return [{ a: 1 }, { b: 2 }]; }

  @Tool({ description: 'Return string' })
  async returnString() { return 'hello world'; }

  @Tool({ description: 'Return number' })
  async returnNumber() { return 42; }

  @Tool({ description: 'Return null' })
  async returnNull() { return null; }
}
