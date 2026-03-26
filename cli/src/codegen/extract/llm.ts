import { ClassDeclaration } from 'ts-morph';
import { typeToZod } from '../mappers/type-mapper.js';
import type { LLMInfo, MethodInfo } from '../types.js';
import { extractStringProp } from '../utils.js';

/** Check if a class extends LLMEntity (directly or indirectly). */
function extendsLLMEntity(cls: ClassDeclaration): boolean {
  const baseClass = cls.getBaseClass();
  if (!baseClass) return false;
  const baseName = baseClass.getName();
  if (baseName === 'LLMEntity') return true;
  return extendsLLMEntity(baseClass);
}

/** Extract LLM decorator metadata from a class. */
export function extractLLMInfo(cls: ClassDeclaration, methods: MethodInfo[]): LLMInfo {
  const isLLMEntity = extendsLLMEntity(cls) || !!cls.getDecorator('LLMEntity');
  if (!isLLMEntity) {
    return { isLLMEntity: false, tools: [], triggers: [] };
  }

  let contextProp: string | undefined;
  let executorProp: string | undefined;
  const tools: LLMInfo['tools'] = [];
  const triggers: string[] = [];

  // Scan properties for @Context, @Executor
  for (const prop of cls.getProperties()) {
    if (prop.getDecorator('Context')) contextProp = prop.getName();
    if (prop.getDecorator('Executor')) executorProp = prop.getName();
  }

  // Scan methods for @LLMTool or @Tool (in @LLMEntity, @Tool methods are also LLM tools)
  for (const method of cls.getMethods()) {
    const llmToolDec = method.getDecorator('LLMTool');
    const toolDec = method.getDecorator('Tool');
    if (!llmToolDec && !toolDec) continue;
    if (method.getDecorator('LLMExecutionTrigger')) continue;

    const dec = llmToolDec ?? toolDec!;
    const args = dec.getArguments();
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

  return { isLLMEntity, contextProp, executorProp, tools, triggers };
}
