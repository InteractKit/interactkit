import 'reflect-metadata';
import type { EntityOptions } from '../types.js';
import { ENTITY_KEY } from './keys.js';

export interface EntityMeta extends EntityOptions { type: string }

function toKebabCase(name: string): string {
  return name.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
}

export function Entity(options: EntityOptions = {}): ClassDecorator {
  return (target) =>
    Reflect.defineMetadata(ENTITY_KEY, { ...options, type: toKebabCase(target.name) } as EntityMeta, target);
}

export function getEntityMeta(target: Function): EntityMeta | undefined {
  return Reflect.getOwnMetadata(ENTITY_KEY, target);
}
