import { addToMap, getMeta } from './helpers.js';
import { PATH_KEY } from './keys.js';

export function __Path(pathId: string): PropertyDecorator & MethodDecorator {
  return (target: object, propertyKey: string | symbol) =>
    addToMap(PATH_KEY, target.constructor, String(propertyKey), pathId);
}

export function getPathMeta(target: Function): Map<string, string> {
  return getMeta(PATH_KEY, target, new Map());
}
