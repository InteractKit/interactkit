import { PropertyDeclaration, Node } from 'ts-morph';

export interface FieldMeta {
  secret?: boolean;
  maxLength?: number;
  minLength?: number;
  max?: number;
  min?: number;
  isEmail?: boolean;
  isUrl?: boolean;
  isInt?: boolean;
  isPositive?: boolean;
  isNegative?: boolean;
  isNotEmpty?: boolean;
}

export interface ValidatorResult {
  /** Zod method chains to append after base type, e.g. ".max(600).min(3)" */
  zodRefinements: string;
  fieldMeta: FieldMeta;
}

/**
 * Reads class-validator + @Secret() decorator calls from the AST
 * and converts them to Zod refinements and fieldMeta.
 */
export function extractValidators(prop: PropertyDeclaration): ValidatorResult {
  const decorators = prop.getDecorators();
  const zodParts: string[] = [];
  const meta: FieldMeta = {};

  for (const dec of decorators) {
    const name = dec.getName();
    const args = dec.getArguments();

    switch (name) {
      case 'Secret':
        meta.secret = true;
        break;

      case 'MaxLength':
        if (args[0]) {
          const val = evalLiteral(args[0]);
          if (typeof val === 'number') {
            zodParts.push(`.max(${val})`);
            meta.maxLength = val;
          }
        }
        break;

      case 'MinLength':
        if (args[0]) {
          const val = evalLiteral(args[0]);
          if (typeof val === 'number') {
            zodParts.push(`.min(${val})`);
            meta.minLength = val;
          }
        }
        break;

      case 'Max':
        if (args[0]) {
          const val = evalLiteral(args[0]);
          if (typeof val === 'number') {
            zodParts.push(`.max(${val})`);
            meta.max = val;
          }
        }
        break;

      case 'Min':
        if (args[0]) {
          const val = evalLiteral(args[0]);
          if (typeof val === 'number') {
            zodParts.push(`.min(${val})`);
            meta.min = val;
          }
        }
        break;

      case 'IsEmail':
        zodParts.push('.email()');
        meta.isEmail = true;
        break;

      case 'IsUrl':
        zodParts.push('.url()');
        meta.isUrl = true;
        break;

      case 'IsInt':
        zodParts.push('.int()');
        meta.isInt = true;
        break;

      case 'IsPositive':
        zodParts.push('.positive()');
        meta.isPositive = true;
        break;

      case 'IsNegative':
        zodParts.push('.negative()');
        meta.isNegative = true;
        break;

      case 'IsNotEmpty':
        zodParts.push('.min(1)');
        meta.isNotEmpty = true;
        break;

      // @Configurable, @Hook, @Entity — skip, handled elsewhere
      // Unknown class-validator decorators — skip silently
    }
  }

  return { zodRefinements: zodParts.join(''), fieldMeta: meta };
}

/** Extract a literal value from an AST expression node. */
function evalLiteral(expr: Node): unknown {
  if (Node.isNumericLiteral(expr)) return expr.getLiteralValue();
  if (Node.isStringLiteral(expr)) return expr.getLiteralValue();
  if (expr.getKind() === 10 /* TrueKeyword */) return true;
  if (expr.getKind() === 95 /* FalseKeyword */) return false;
  if (Node.isPrefixUnaryExpression(expr)) {
    // Handle negative numbers: -5
    const operand = expr.getOperand();
    if (Node.isNumericLiteral(operand)) {
      return -operand.getLiteralValue();
    }
  }
  // Fallback: try parsing the text
  const text = expr.getText();
  const num = Number(text);
  if (!isNaN(num)) return num;
  return text;
}
