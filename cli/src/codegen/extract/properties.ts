import { PropertyDeclaration } from 'ts-morph';
import { typeToZod } from '../mappers/type-mapper.js';

type Classification =
  | { kind: 'ref'; entityType: string }
  | { kind: 'stream'; payloadZod: string }
  | { kind: 'component'; entityType: string }
  | { kind: 'state' };

/** Classify a property by its type annotation or decorator. */
export function classifyProperty(
  prop: PropertyDeclaration,
  classToEntityType: Map<string, string>,
): Classification {
  const typeNodeText = prop.getTypeNode()?.getText() ?? '';

  // EntityRef<T> — must check source text since type alias erases
  const refMatch = typeNodeText.match(/^EntityRef<(\w+)>$/);
  if (refMatch) {
    const targetClass = refMatch[1];
    const entityType = classToEntityType.get(targetClass) ?? targetClass;
    return { kind: 'ref', entityType };
  }

  // @Ref() decorator
  if (prop.getDecorator('Ref')) {
    const type = prop.getType();
    const symbol = type.getSymbol();
    const className = symbol?.getName();
    if (className && classToEntityType.has(className)) {
      return { kind: 'ref', entityType: classToEntityType.get(className)! };
    }
  }

  // EntityStream<T> — by type annotation or @Stream() decorator
  const streamMatch = typeNodeText.match(/^EntityStream<(.+)>$/);
  if (streamMatch || prop.getDecorator('Stream')) {
    const payloadType = prop.getType().getTypeArguments()[0];
    const payloadZod = payloadType ? typeToZod(payloadType) : 'z.unknown()';
    return { kind: 'stream', payloadZod };
  }

  // Entity-typed (component) — check if the type is a known entity class
  const type = prop.getType();
  const symbol = type.getSymbol();
  const className = symbol?.getName();
  if (className && classToEntityType.has(className)) {
    return { kind: 'component', entityType: classToEntityType.get(className)! };
  }

  return { kind: 'state' };
}
