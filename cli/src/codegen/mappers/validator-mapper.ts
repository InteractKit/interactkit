import { PropertyDeclaration } from 'ts-morph';

export interface FieldMeta {
  secret?: boolean;
}

export interface ValidatorResult {
  fieldMeta: FieldMeta;
}

/**
 * Reads @Secret() decorator from the AST and returns fieldMeta.
 * Validation is now handled via the `validate` option in @State().
 */
export function extractValidators(prop: PropertyDeclaration): ValidatorResult {
  const meta: FieldMeta = {};

  for (const dec of prop.getDecorators()) {
    if (dec.getName() === 'Secret') {
      meta.secret = true;
    }
  }

  return { fieldMeta: meta };
}
