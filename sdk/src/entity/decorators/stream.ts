import { setPropertyDecorator, getMeta } from './helpers.js';
import { STREAM_KEY } from './keys.js';

export function Stream(): PropertyDecorator {
  return setPropertyDecorator(STREAM_KEY);
}

export function getStreamMeta(target: Function): Set<string> {
  return getMeta(STREAM_KEY, target, new Set());
}
