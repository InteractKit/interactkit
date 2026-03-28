import 'reflect-metadata';

/** Get or create a Map<string, V> on a class, add a key-value pair. */
export function addToMap<V>(key: symbol, target: Function, propKey: string, value: V): void {
  const map: Map<string, V> = Reflect.getOwnMetadata(key, target) ?? new Map();
  map.set(propKey, value);
  Reflect.defineMetadata(key, map, target);
}

/** Get or create a Set<string> on a class, add a value. */
export function addToSet(key: symbol, target: Function, propKey: string): void {
  const set: Set<string> = Reflect.getOwnMetadata(key, target) ?? new Set();
  set.add(propKey);
  Reflect.defineMetadata(key, set, target);
}

/** Get or create an array on a class, push an item. */
export function pushToArray<V>(key: symbol, target: Function, value: V): void {
  const arr: V[] = Reflect.getOwnMetadata(key, target) ?? [];
  arr.push(value);
  Reflect.defineMetadata(key, arr, target);
}

/** Read metadata or return a default. */
export function getMeta<V>(key: symbol, target: Function, fallback: V): V {
  return Reflect.getOwnMetadata(key, target) ?? fallback;
}

/** Property decorator that adds to a Map<string, V>. */
export function mapPropertyDecorator<V>(key: symbol, value: V): PropertyDecorator {
  return (target, propertyKey) => addToMap(key, target.constructor, String(propertyKey), value);
}

/** Property decorator that adds to a Set<string>. */
export function setPropertyDecorator(key: symbol): PropertyDecorator {
  return (target, propertyKey) => addToSet(key, target.constructor, String(propertyKey));
}
