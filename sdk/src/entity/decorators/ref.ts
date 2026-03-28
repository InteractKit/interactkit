import { setPropertyDecorator, getMeta } from './helpers.js';
import { REF_KEY } from './keys.js';

export function Ref(): PropertyDecorator {
  return setPropertyDecorator(REF_KEY);
}

export function getRefMeta(target: Function): Set<string> {
  return getMeta(REF_KEY, target, new Set());
}
