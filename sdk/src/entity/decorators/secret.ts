import { setPropertyDecorator, getMeta } from './helpers.js';

const SECRET_KEY = Symbol('entity:secret');

/** Marks a property as sensitive — masked in UI/logs. */
export function Secret(): PropertyDecorator {
  return setPropertyDecorator(SECRET_KEY);
}

export function getSecretMeta(target: Function): Set<string> {
  return getMeta(SECRET_KEY, target, new Set());
}
