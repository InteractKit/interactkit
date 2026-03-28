/** Generate a base entity template. */
export function entityTemplate(name: string, _type: string, remote?: boolean): string {
  const imports = remote
    ? `import { Entity, BaseEntity, Hook, Init, State, Tool, Describe, RedisPubSubAdapter } from '@interactkit/sdk';`
    : `import { Entity, BaseEntity, Hook, Init, State, Tool, Describe } from '@interactkit/sdk';`;
  const entityOpts = remote
    ? `{ pubsub: RedisPubSubAdapter }`
    : `{}`;
  return `${imports}

@Entity(${entityOpts})
export class ${name} extends BaseEntity {
  @Describe()
  describe() {
    return '${name} entity.';
  }

  @Hook(Init.Runner())
  async onInit(input: Init.Input) {
    console.log(\`[\${this.id}] ${name} initialized\`);
  }
}
`;
}
