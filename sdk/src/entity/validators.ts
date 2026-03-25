import 'reflect-metadata';

const SECRET_META_KEY = Symbol('entity:secret');

/**
 * Marks a string property as sensitive — masked in UI/logs.
 * Domain-specific to @interactkit/sdk. All other validation
 * decorators come from class-validator.
 */
export function Secret(): PropertyDecorator {
  return function (target: object, propertyKey: string | symbol) {
    const ctor = target.constructor;
    const fields: Set<string> = Reflect.getOwnMetadata(SECRET_META_KEY, ctor) ?? new Set();
    fields.add(String(propertyKey));
    Reflect.defineMetadata(SECRET_META_KEY, fields, ctor);
  };
}

export function getSecretMeta(target: Function): Set<string> {
  return Reflect.getOwnMetadata(SECRET_META_KEY, target) ?? new Set();
}
