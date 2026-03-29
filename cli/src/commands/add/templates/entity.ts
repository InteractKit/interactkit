/** Generate a base entity template. */
export function entityTemplate(name: string, _type: string, detached?: boolean): string {
  const entityOpts = detached
    ? `{ detached: true }`
    : `{}`;
  return `import { Entity, BaseEntity, Hook, Init, State, Tool } from '@interactkit/sdk';

@Entity(${entityOpts})
export class ${name} extends BaseEntity {
  @Hook(Init.Runner())
  async onInit(input: Init.Input) {
    console.log(\`[\${this.id}] ${name} initialized\`);
  }
}
`;
}
