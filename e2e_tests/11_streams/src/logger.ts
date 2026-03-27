import { Entity, BaseEntity, Describe, Stream, Tool } from '@interactkit/sdk';
import type { EntityStream } from '@interactkit/sdk';

@Entity()
export class Logger extends BaseEntity {
  @Describe() describe() { return 'Logger'; }
  @Stream() entries!: EntityStream<string>;

  @Tool({ description: 'Log message' })
  async log(input: { msg: string }) {
    this.entries.emit(input.msg);
    return { logged: true };
  }
}
