import { PropertyDeclaration, Node } from 'ts-morph';
import { parseType, parsedTypeToZod } from '@/codegen/utils/parse-type.js';
import { extractStringProp } from '@/codegen/utils/extract-string-prop.js';
import type { ParsedStateVar } from '../types/parsed-state-var.js';
import type { FieldMeta } from '../types/field-meta.js';

/**
 * Parse a property classified as 'state' into a rich ParsedStateVar.
 * Extracts type info, @State options, @Secret, @Describe decorators,
 * default values, and generates zod validation code.
 */
export function parseStateVar(prop: PropertyDeclaration): ParsedStateVar {
  const name = prop.getName();
  const optional = prop.hasQuestionToken();
  const isPrivate = prop.getScope() === 'private';

  // Parse the rich type
  const type = parseType(prop.getType());

  // Extract @Secret → fieldMeta
  const fieldMeta: FieldMeta = {};
  if (prop.getDecorator('Secret')) {
    fieldMeta.secret = true;
  }

  // Check for validate in @State({ validate: z.string().min(2) })
  let zodCode: string | undefined;
  let validation: string | undefined;
  let description: string | undefined;
  const stateDec = prop.getDecorator('State');

  if (stateDec) {
    const stateArgs = stateDec.getArguments();
    if (stateArgs[0] && Node.isObjectLiteralExpression(stateArgs[0])) {
      const validateProp = stateArgs[0].getProperty('validate');
      if (validateProp && Node.isPropertyAssignment(validateProp)) {
        zodCode = validateProp.getInitializer()?.getText();
        validation = zodCode;
      }
    }
    // Extract description from @State({ description: '...' })
    const stateText = stateArgs[0]?.getText() ?? '{}';
    description = extractStringProp(stateText, 'description');
  }

  // Fall back to auto-derived Zod type
  if (!zodCode) {
    zodCode = parsedTypeToZod(type);
  }

  // Get default value
  const initializer = prop.getInitializer();
  const defaultValue = initializer?.getText();

  return {
    name,
    type,
    zodCode: optional ? `${zodCode}.optional()` : zodCode,
    optional,
    fieldMeta,
    hasState: stateDec !== undefined,
    hasDescribe: prop.getDecorator('Describe') !== undefined,
    hasExecutor: prop.getDecorator('Executor') !== undefined,
    isPrivate,
    description,
    validation,
    defaultValue,
  };
}
