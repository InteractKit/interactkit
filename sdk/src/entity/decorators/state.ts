import { mapPropertyDecorator, getMeta } from './helpers.js';
import { STATE_KEY } from './keys.js';

export interface StateOptions { description: string; validate?: unknown }

export function State(options: StateOptions): PropertyDecorator {
  return mapPropertyDecorator(STATE_KEY, options);
}

export function getStateMeta(target: Function): Map<string, StateOptions> {
  return getMeta(STATE_KEY, target, new Map());
}
