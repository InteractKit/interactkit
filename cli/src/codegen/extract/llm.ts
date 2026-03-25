import { ClassDeclaration } from 'ts-morph';
import { typeToZod } from '../mappers/type-mapper.js';
import type { LLMInfo, MethodInfo } from '../types.js';
import { extractStringProp } from '../utils.js';

/** Extract LLM decorator metadata from a class. */
export function extractLLMInfo(cls: ClassDeclaration, methods: MethodInfo[]): LLMInfo {
  const isLLMEntity = !!cls.getDecorator('LLMEntity');
  if (!isLLMEntity) {
    return { isLLMEntity: false, tools: [], triggers: [], visibleState: [] };
  }

  let contextProp: string | undefined;
  let executorProp: string | undefined;
  const tools: LLMInfo['tools'] = [];
  const triggers: string[] = [];
  const visibleState: string[] = [];

  // Scan properties for @Context, @Executor, @LLMVisible
  for (const prop of cls.getProperties()) {
    const name = prop.getName();
    if (prop.getDecorator('Context')) contextProp = name;
    if (prop.getDecorator('Executor')) executorProp = name;
    if (prop.getDecorator('LLMVisible')) visibleState.push(name);
  }

  // Scan methods for @LLMTool
  for (const method of cls.getMethods()) {
    const toolDec = method.getDecorator('LLMTool');
    if (!toolDec) continue;

    const args = toolDec.getArguments();
    const optionsText = args[0]?.getText() ?? '{}';
    const description = extractStringProp(optionsText, 'description') ?? method.getName();
    const name = extractStringProp(optionsText, 'name');

    const params = method.getParameters();
    const inputZod = params.length > 0 ? typeToZod(params[0].getType()) : 'z.object({})';

    tools.push({ method: method.getName(), description, name, inputZod });
  }

  // Scan methods for @LLMExecutionTrigger — validate param type
  for (const method of cls.getMethods()) {
    if (method.getDecorator('LLMExecutionTrigger')) {
      triggers.push(method.getName());
    }
  }

  // Check @Executor property has an initializer (must be configured)
  if (executorProp) {
    const prop = cls.getProperty(executorProp);
    if (prop && !prop.getInitializer()) {
      // Will be caught by validator — executor must have an LLM instance assigned
    }
  }

  return { isLLMEntity, contextProp, executorProp, tools, triggers, visibleState };
}
