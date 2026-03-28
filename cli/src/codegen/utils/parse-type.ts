import { Type, Symbol as MorphSymbol } from 'ts-morph';
import type { ParsedType, ParsedProperty } from './types/parsed-type.js';

const MAX_DEPTH = 10;

// ─── Parse ts-morph Type → ParsedType AST ───────────────

/** Recursively convert a ts-morph Type into a rich ParsedType AST. */
export function parseType(type: Type, depth = 0): ParsedType {
  if (depth > MAX_DEPTH || !type) return { kind: 'unknown' };

  // Primitives
  if (type.isString()) return { kind: 'string' };
  if (type.isNumber()) return { kind: 'number' };
  if (type.isBoolean()) return { kind: 'boolean' };
  if (type.isNull()) return { kind: 'null' };
  if (type.isUndefined()) return { kind: 'undefined' };
  if (type.isAny()) return { kind: 'any' };
  if (type.isUnknown()) return { kind: 'unknown' };

  // Void / Never
  const text = type.getText();
  if (text === 'void') return { kind: 'void' };
  if (text === 'never') return { kind: 'never' };

  // Literals
  if (type.isStringLiteral()) return { kind: 'literal', value: type.getLiteralValue() as string };
  if (type.isNumberLiteral()) return { kind: 'literal', value: type.getLiteralValue() as number };
  if (type.isBooleanLiteral()) return { kind: 'literal', value: type.getText() === 'true' };

  // Union
  if (type.isUnion()) {
    const members = type.getUnionTypes().map(m => parseType(m, depth + 1));
    const nonUndefined = members.filter(m => m.kind !== 'undefined');

    // All string literals → enum
    if (nonUndefined.length > 0 && nonUndefined.every(m => m.kind === 'literal' && typeof (m as any).value === 'string')) {
      const values = nonUndefined.map(m => (m as Extract<ParsedType, { kind: 'literal' }>).value as string);
      const enumType: ParsedType = { kind: 'enum', values };
      if (nonUndefined.length < members.length) {
        return { kind: 'union', members: [enumType, { kind: 'undefined' }] };
      }
      return enumType;
    }

    return { kind: 'union', members };
  }

  // Intersection
  if (type.isIntersection()) {
    const members = type.getIntersectionTypes().map(m => parseType(m, depth + 1));
    return { kind: 'intersection', members };
  }

  // Array
  if (type.isArray()) {
    const elementType = type.getArrayElementTypeOrThrow();
    return { kind: 'array', element: parseType(elementType, depth + 1) };
  }

  // Tuple
  if (type.isTuple()) {
    const elements = type.getTupleElements().map(e => parseType(e, depth + 1));
    return { kind: 'tuple', elements };
  }

  // Object types
  if (type.isObject()) {
    const symbol = type.getSymbol() ?? type.getAliasSymbol();
    const name = symbol?.getName();

    // Date
    if (name === 'Date') return { kind: 'date' };

    // Promise<T> → unwrap
    if (name === 'Promise') {
      const typeArgs = type.getTypeArguments();
      return typeArgs.length > 0
        ? { kind: 'promise', inner: parseType(typeArgs[0], depth + 1) }
        : { kind: 'unknown' };
    }

    // Record<string, T>
    const stringIndex = type.getStringIndexType();
    if (stringIndex) {
      return { kind: 'record', key: { kind: 'string' }, value: parseType(stringIndex, depth + 1) };
    }

    // Object literal / interface
    const properties = type.getProperties();
    if (properties.length > 0) {
      const parsed: ParsedProperty[] = properties.map(prop => ({
        name: prop.getName(),
        type: parseType(getPropertyType(prop, type), depth + 1),
        optional: prop.isOptional(),
      }));
      return { kind: 'object', properties: parsed };
    }
  }

  // Enum
  if (type.isEnum()) {
    const members = type.getUnionTypes();
    const values = members.map(m => m.getLiteralValue() as string | number);
    return { kind: 'enum', values };
  }

  return { kind: 'unknown' };
}

// ─── ParsedType → Zod code string ──────────────────────

/** Convert a ParsedType AST into a Zod code string. */
export function parsedTypeToZod(parsed: ParsedType): string {
  switch (parsed.kind) {
    case 'string': return 'z.string()';
    case 'number': return 'z.number()';
    case 'boolean': return 'z.boolean()';
    case 'null': return 'z.null()';
    case 'undefined': return 'z.undefined()';
    case 'void': return 'z.void()';
    case 'any': return 'z.any()';
    case 'unknown': return 'z.unknown()';
    case 'never': return 'z.never()';
    case 'date': return 'z.date()';

    case 'literal':
      return typeof parsed.value === 'string'
        ? `z.literal(${JSON.stringify(parsed.value)})`
        : `z.literal(${parsed.value})`;

    case 'array':
      return `z.array(${parsedTypeToZod(parsed.element)})`;

    case 'tuple':
      return `z.tuple([${parsed.elements.map(parsedTypeToZod).join(', ')}])`;

    case 'object': {
      const fields = parsed.properties.map(p => {
        let zod = parsedTypeToZod(p.type);
        if (p.optional) zod += '.optional()';
        return `${p.name}: ${zod}`;
      });
      return `z.object({ ${fields.join(', ')} })`;
    }

    case 'record':
      return `z.record(${parsedTypeToZod(parsed.key)}, ${parsedTypeToZod(parsed.value)})`;

    case 'union': {
      const nonUndefined = parsed.members.filter(m => m.kind !== 'undefined');
      const isOptional = nonUndefined.length < parsed.members.length;

      if (nonUndefined.length === 1) {
        const base = parsedTypeToZod(nonUndefined[0]);
        return isOptional ? `${base}.optional()` : base;
      }

      const base = `z.union([${nonUndefined.map(parsedTypeToZod).join(', ')}])`;
      return isOptional ? `${base}.optional()` : base;
    }

    case 'intersection':
      return parsed.members.map(parsedTypeToZod).reduce((a, b) => `${a}.and(${b})`);

    case 'enum': {
      if (parsed.values.every(v => typeof v === 'string')) {
        return `z.enum([${parsed.values.map(v => JSON.stringify(v)).join(', ')}])`;
      }
      return `z.union([${parsed.values.map(v => `z.literal(${v})`).join(', ')}])`;
    }

    case 'promise':
      return parsedTypeToZod(parsed.inner);
  }
}

// ─── Convenience: ts-morph Type → Zod string ───────────

/** Shortcut combining parseType + parsedTypeToZod. Drop-in replacement for old typeToZod. */
export function typeToZod(type: Type, depth = 0): string {
  return parsedTypeToZod(parseType(type, depth));
}

// ─── Internal helpers ───────────────────────────────────

function getPropertyType(prop: MorphSymbol, _parentType: Type): Type {
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
  return null as unknown as Type;
}
