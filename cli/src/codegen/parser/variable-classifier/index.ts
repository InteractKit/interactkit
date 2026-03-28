import { PropertyDeclaration } from 'ts-morph';
import { parseType, parsedTypeToZod } from '@/codegen/utils/parse-type.js';
import type { ParsedType } from '@/codegen/utils/types/parsed-type.js';

export type VariableClassification =
  | { kind: 'ref'; entityType: string; className: string; isRemote: boolean }
  | { kind: 'stream'; payloadType: ParsedType; payloadZod: string }
  | { kind: 'component'; entityType: string; className: string; isRemote: boolean }
  | { kind: 'state' };

/**
 * Classify a property as ref, stream, component, or state
 * based on its type annotation and decorators.
 */
export function classifyVariable(
  prop: PropertyDeclaration,
  classToEntityType: Map<string, string>,
): VariableClassification {
  const typeNodeText = prop.getTypeNode()?.getText() ?? '';

  // Detect Remote<T> wrapping
  const remoteMatch = typeNodeText.match(/^Remote<(.+)>$/);
  const isRemote = !!remoteMatch;
  const innerTypeText = remoteMatch ? remoteMatch[1] : typeNodeText;

  // EntityRef<T> — must check source text since type alias erases
  const refMatch = innerTypeText.match(/^EntityRef<(\w+)>$/);
  if (refMatch) {
    const targetClass = refMatch[1];
    const entityType = classToEntityType.get(targetClass) ?? targetClass;
    return { kind: 'ref', entityType, className: targetClass, isRemote };
  }

  // @Ref() decorator
  if (prop.getDecorator('Ref')) {
    // Use innerTypeText for Remote<T> — mapped types don't expose type arguments
    if (isRemote && classToEntityType.has(innerTypeText)) {
      return { kind: 'ref', entityType: classToEntityType.get(innerTypeText)!, className: innerTypeText, isRemote };
    }
    const type = prop.getType();
    const symbol = type.getSymbol();
    const className = symbol?.getName();
    if (className && classToEntityType.has(className)) {
      return { kind: 'ref', entityType: classToEntityType.get(className)!, className, isRemote };
    }
  }

  // EntityStream<T> — by type annotation or @Stream() decorator
  const streamMatch = innerTypeText.match(/^EntityStream<(.+)>$/);
  if (streamMatch || prop.getDecorator('Stream')) {
    const payloadTsMorphType = prop.getType().getTypeArguments()[0];
    const payloadType: ParsedType = payloadTsMorphType
      ? parseType(payloadTsMorphType)
      : { kind: 'unknown' };
    const payloadZod = parsedTypeToZod(payloadType);
    return { kind: 'stream', payloadType, payloadZod };
  }

  // Entity-typed (component) — use innerTypeText for Remote<T>, fall back to type symbol
  if (isRemote && classToEntityType.has(innerTypeText)) {
    return { kind: 'component', entityType: classToEntityType.get(innerTypeText)!, className: innerTypeText, isRemote };
  }
  const type = prop.getType();
  const symbol = type.getSymbol();
  const className = symbol?.getName();
  if (className && classToEntityType.has(className)) {
    return { kind: 'component', entityType: classToEntityType.get(className)!, className, isRemote };
  }

  return { kind: 'state' };
}
