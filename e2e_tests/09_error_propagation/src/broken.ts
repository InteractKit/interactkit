import { Entity, BaseEntity, Describe, Tool } from '@interactkit/sdk';

@Entity()
export class Broken extends BaseEntity {
  @Describe() describe() { return 'Broken entity'; }

  @Tool({ description: 'Always fails' })
  async fail(input: { msg: string }) {
    throw new Error(`BOOM: ${input.msg}`);
  }

  @Tool({ description: 'Fails with custom error' })
  async failTyped(input: { code: number }) {
    const err = new Error(`Error code ${input.code}`);
    (err as any).code = input.code;
    throw err;
  }
}
