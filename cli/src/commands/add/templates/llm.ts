/** Generate an LLM entity template. */
export function llmTemplate(name: string, _type: string, detached?: boolean): string {
  const entityOpts = detached
    ? `{ description: 'TODO: describe this entity', detached: true }`
    : `{ description: 'TODO: describe this entity' }`;
  return `import {
  Entity, LLMEntity, Hook, Init, State,
  Executor, Tool,
} from '@interactkit/sdk';
import { ChatOpenAI } from '@langchain/openai';

@Entity(${entityOpts})
export class ${name} extends LLMEntity {
  @Executor()
  private llm = new ChatOpenAI({ model: 'gpt-4o-mini' });

  @Hook(Init.Runner())
  async onInit(input: Init.Input) {
    console.log(\`[\${this.id}] ${name} initialized\`);
  }

  @Tool({ description: 'TODO: describe what this tool does' })
  async doSomething(input: { query: string }): Promise<string> {
    return \`Processing: \${input.query}\`;
  }
}
`;
}
