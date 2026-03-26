import { Type, Symbol as MorphSymbol } from 'ts-morph';

const MAX_DEPTH = 10;

/**
 * Recursively converts a ts-morph Type into a Zod code string.
 */
export function typeToZod(type: Type, depth = 0): string {
  if (depth > MAX_DEPTH || !type) return 'z.unknown()';

  // Primitives
  if (type.isString()) return 'z.string()';
  if (type.isNumber()) return 'z.number()';
  if (type.isBoolean()) return 'z.boolean()';
  if (type.isNull()) return 'z.null()';
  if (type.isUndefined()) return 'z.undefined()';
  if (type.isAny()) return 'z.any()';
  if (type.isUnknown()) return 'z.unknown()';

  // Void / Never
  const text = type.getText();
  if (text === 'void') return 'z.void()';
  if (text === 'never') return 'z.never()';

  // Literals
  if (type.isStringLiteral()) return `z.literal(${JSON.stringify(type.getLiteralValue())})`;
  if (type.isNumberLiteral()) return `z.literal(${type.getLiteralValue()})`;
  if (type.isBooleanLiteral()) return `z.literal(${type.getLiteralValue()})`;

  // Union
  if (type.isUnion()) {
    const members = type.getUnionTypes();
    const nonUndefined = members.filter(m => !m.isUndefined());
    const isOptional = nonUndefined.length < members.length;

    // All string literals → z.enum()
    if (nonUndefined.length > 0 && nonUndefined.every(m => m.isStringLiteral())) {
      const values = nonUndefined.map(m => JSON.stringify(m.getLiteralValue()));
      const base = `z.enum([${values.join(', ')}])`;
      return isOptional ? `${base}.optional()` : base;
    }

    // General union
    if (nonUndefined.length === 1) {
      const base = typeToZod(nonUndefined[0], depth + 1);
      return isOptional ? `${base}.optional()` : base;
    }

    const mapped = nonUndefined.map(m => typeToZod(m, depth + 1));
    const base = `z.union([${mapped.join(', ')}])`;
    return isOptional ? `${base}.optional()` : base;
  }

  // Intersection
  if (type.isIntersection()) {
    const members = type.getIntersectionTypes();
    return members.map(m => typeToZod(m, depth + 1)).reduce((a, b) => `${a}.and(${b})`);
  }

  // Array
  if (type.isArray()) {
    const elementType = type.getArrayElementTypeOrThrow();
    return `z.array(${typeToZod(elementType, depth + 1)})`;
  }

  // Tuple
  if (type.isTuple()) {
    const elements = type.getTupleElements();
    return `z.tuple([${elements.map(e => typeToZod(e, depth + 1)).join(', ')}])`;
  }

  // Object types
  if (type.isObject()) {
    const symbol = type.getSymbol() ?? type.getAliasSymbol();
    const name = symbol?.getName();

    // Date
    if (name === 'Date') return 'z.date()';

    // Promise<T> → unwrap
    if (name === 'Promise') {
      const typeArgs = type.getTypeArguments();
      return typeArgs.length > 0 ? typeToZod(typeArgs[0], depth + 1) : 'z.unknown()';
    }

    // Record<string, T> — check for string index signature
    const stringIndex = type.getStringIndexType();
    if (stringIndex) {
      return `z.record(z.string(), ${typeToZod(stringIndex, depth + 1)})`;
    }

    // Object literal / interface
    const properties = type.getProperties();
    if (properties.length > 0) {
      const fields = properties.map(prop => {
        const propType = getPropertyType(prop, type);
        const isOptional = prop.isOptional();
        let zod = typeToZod(propType, depth + 1);
        if (isOptional) zod += '.optional()';
        return `${prop.getName()}: ${zod}`;
      });
      return `z.object({ ${fields.join(', ')} })`;
    }
  }

  // Enum
  if (type.isEnum()) {
    const members = type.getUnionTypes();
    if (members.every(m => m.isStringLiteral())) {
      const values = members.map(m => JSON.stringify(m.getLiteralValue()));
      return `z.enum([${values.join(', ')}])`;
    }
    if (members.every(m => m.isNumberLiteral())) {
      const values = members.map(m => m.getLiteralValue());
      return `z.union([${values.map(v => `z.literal(${v})`).join(', ')}])`;
    }
  }

  return 'z.unknown()';
}

/** Extract the type of a property symbol, handling declarations correctly. */
function getPropertyType(prop: MorphSymbol, parentType: Type): Type {
  const declarations = prop.getDeclarations();
  if (declarations.length > 0) {
    const decl = declarations[0];
    if ('getType' in decl && typeof decl.getType === 'function') {
      return (decl as { getType(): Type }).getType();
    }
  }
  const valueDecl = prop.getValueDeclaration();
  if (valueDecl) {
    return prop.getTypeAtLocation(valueDecl);
  }
  // Symbol has no value declaration (e.g. type-only from external libs) — return null to signal z.unknown()
  return null as unknown as Type;
}
