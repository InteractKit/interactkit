import { Entity, BaseEntity, Describe, State, Tool } from '@interactkit/sdk';

@Entity({ detached: true })
export class ResultStore extends BaseEntity {
  @Describe() describe() { return `ResultStore: ${this.results.length} results`; }
  @State({ description: 'results' }) private results: Array<{ taskId: string; result: string; worker: string }> = [];

  @Tool({ description: 'Store result' })
  async store(input: { taskId: string; result: string; worker: string }) {
    this.results.push(input);
    return this.results.length;
  }

  @Tool({ description: 'Get results' })
  async getResults() { return [...this.results]; }

  @Tool({ description: 'Count' })
  async count() { return this.results.length; }
}
