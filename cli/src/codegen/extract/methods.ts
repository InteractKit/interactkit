import { MethodDeclaration } from 'ts-morph';
import { typeToZod } from '../mappers/type-mapper.js';
import type { MethodInfo } from '../types.js';
import type { FieldMeta } from '../mappers/validator-mapper.js';

export function extractMethod(method: MethodDeclaration, entityType: string): MethodInfo {
  const methodName = method.getName();
  const eventName = `${entityType}.${methodName}`;
  const params = method.getParameters();
  const fieldMeta: Record<string, FieldMeta> = {};

  let inputZod = 'z.object({})';
  if (params.length > 0) {
    inputZod = typeToZod(params[0].getType());
  }

  let resultType = method.getReturnType();
  const resultSymbol = resultType.getSymbol();
  if (resultSymbol?.getName() === 'Promise') {
    const typeArgs = resultType.getTypeArguments();
    if (typeArgs.length > 0) resultType = typeArgs[0];
  }
  const resultText = resultType.getText();
  const resultZod = resultText === 'void' ? 'z.void()' : typeToZod(resultType);

  const hasTool = method.getDecorator('Tool') !== undefined;

  return { eventName, methodName, inputZod, resultZod, fieldMeta, hasTool };
}
