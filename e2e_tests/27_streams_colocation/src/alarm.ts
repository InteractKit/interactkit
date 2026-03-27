import { Entity, BaseEntity, Describe, Stream, State, Tool } from '@interactkit/sdk';
import type { EntityStream } from '@interactkit/sdk';

@Entity()
export class Alarm extends BaseEntity {
  @Describe() describe() { return `Alarm: ${this.triggered} triggered`; }
  @Stream() alerts!: EntityStream<string>;
  @State({ description: 'triggered' }) private triggered = 0;

  @Tool({ description: 'Trigger alarm' })
  async trigger(input: { level: string }) {
    this.triggered++;
    this.alerts.emit(`ALARM:${input.level}:${this.triggered}`);
    return { triggered: this.triggered };
  }
}
