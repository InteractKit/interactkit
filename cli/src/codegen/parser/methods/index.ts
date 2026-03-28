import { MethodDeclaration } from 'ts-morph';
import { parseType, parsedTypeToZod } from '@/codegen/utils/parse-type.js';
import { extractStringProp } from '@/codegen/utils/extract-string-prop.js';
import type { ParsedMethod } from '../types/parsed-method.js';
import type { FieldMeta } from '../types/field-meta.js';

/**
 * Parse a public async method into a rich ParsedMethod.
 * Extracts input/result types, parameters, @Tool metadata,
 * and generates zod validation code.
 */
export function parseMethod(method: MethodDeclaration, entityType: string): ParsedMethod {
  const methodName = method.getName();
  const eventName = `${entityType}.${methodName}`;
  const params = method.getParameters();
  const fieldMeta: Record<string, FieldMeta> = {};

  // Parse all parameters
  const parameters = params.map(p => ({
    name: p.getName(),
    type: parseType(p.getType()),
    optional: p.isOptional(),
  }));

  // Input type (first parameter)
  const inputType = params.length > 0
    ? parseType(params[0].getType())
    : { kind: 'object' as const, properties: [] };
  const inputZod = parsedTypeToZod(inputType);

  // Result type (unwrap Promise)
  let resultTsMorphType = method.getReturnType();
  const resultSymbol = resultTsMorphType.getSymbol();
  if (resultSymbol?.getName() === 'Promise') {
    const typeArgs = resultTsMorphType.getTypeArguments();
    if (typeArgs.length > 0) resultTsMorphType = typeArgs[0];
  }
  const resultText = resultTsMorphType.getText();
  const resultType = resultText === 'void'
    ? { kind: 'void' as const }
    : parseType(resultTsMorphType);
  const resultZod = parsedTypeToZod(resultType);

  // @Tool decorator metadata
  const toolDec = method.getDecorator('Tool');
  const hasTool = toolDec !== undefined;
  let toolDescription: string | undefined;
  let toolName: string | undefined;
  if (toolDec) {
    const args = toolDec.getArguments();
    const optionsText = args[0]?.getText() ?? '{}';
    toolDescription = extractStringProp(optionsText, 'description');
    toolName = extractStringProp(optionsText, 'name');
  }

  return {
    eventName,
    methodName,
    inputType,
    resultType,
    inputZod,
    resultZod,
    parameters,
    fieldMeta,
    hasTool,
    toolDescription,
    toolName,
    isAsync: method.isAsync(),
  };
}
