/** Generate an LLM entity template. */
export function llmTemplate(name: string, _type: string, remote?: boolean): string {
  const sdkImports = remote
    ? `Entity, LLMEntity, Hook, Init, State,\n  Executor, Tool, Describe, RedisPubSubAdapter,`
    : `Entity, LLMEntity, Hook, Init, State,\n  Executor, Tool, Describe,`;
  const entityOpts = remote
    ? `{ description: 'TODO: describe this entity', pubsub: RedisPubSubAdapter }`
    : `{ description: 'TODO: describe this entity' }`;
  return `import {
  ${sdkImports}
} from '@interactkit/sdk';
import { ChatOpenAI } from '@langchain/openai';

@Entity(${entityOpts})
export class ${name} extends LLMEntity {
  @Describe()
  describe() {
    return 'You are a helpful assistant.';
  }

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
