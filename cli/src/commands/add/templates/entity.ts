/** Generate a base entity template. */
export function entityTemplate(name: string, type: string): string {
  return `import { Entity, BaseEntity, Hook, Init, State, Tool, Describe } from '@interactkit/sdk';

@Entity({ type: '${type}' })
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
