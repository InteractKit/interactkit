/** Generate an LLM entity template. */
export function llmTemplate(name: string, _type: string): string {
  return `import {
  Entity, LLMEntity, Hook, Init, State,
  Executor, Tool, Describe,
} from '@interactkit/sdk';
import { ChatOpenAI } from '@langchain/openai';

@Entity({ description: 'TODO: describe this entity' })
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
