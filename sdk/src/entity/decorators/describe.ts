import 'reflect-metadata';
import { DESCRIBE_KEY } from './keys.js';

export function Describe(): MethodDecorator {
  return (target, propertyKey) =>
    Reflect.defineMetadata(DESCRIBE_KEY, String(propertyKey), target.constructor);
}

export function getDescribeMethod(target: Function): string | undefined {
  return Reflect.getOwnMetadata(DESCRIBE_KEY, target);
}
