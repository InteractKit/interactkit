import { Entity, BaseEntity, Describe, State, Tool } from '@interactkit/sdk';

export class Counter {
  private n = 0;
  increment() { return ++this.n; }
  get() { return this.n; }
}

export class NestedObj {
  private items: string[] = [];
  add(item: string) { this.items.push(item); return this.items.length; }
  getAll() { return [...this.items]; }
  getCounter() { return new Counter(); }
}

@Entity({ detached: true })
export class Worker extends BaseEntity {
  @Describe() describe() { return 'Worker'; }

  @State({ description: 'data' })
  private data: string[] = [];

  @Tool({ description: 'Get data' })
  async getData() {
    return { items: [...this.data], count: this.data.length, pid: process.pid };
  }

  @Tool({ description: 'Get adder' })
  async getAdder(): Promise<(a: number, b: number) => number> {
    return (a: number, b: number) => a + b;
  }

  @Tool({ description: 'Get counter' })
  async getCounter(): Promise<Counter> {
    return new Counter();
  }

  @Tool({ description: 'Get nested object' })
  async getNested(): Promise<NestedObj> {
    return new NestedObj();
  }

  @Tool({ description: 'Get callback maker' })
  async getCallbackMaker(): Promise<(prefix: string) => (x: string) => string> {
    return (prefix: string) => (x: string) => `${prefix}:${x}`;
  }

  @Tool({ description: 'Store' })
  async store(input: { text: string }) {
    this.data.push(input.text);
    return { stored: true, total: this.data.length };
  }

  @Tool({ description: 'Get PID' })
  async getPid() { return process.pid; }
}
