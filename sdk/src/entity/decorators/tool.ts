import { addToMap, getMeta } from './helpers.js';
import { TOOL_KEY } from './keys.js';

export interface ToolOptions { description: string; name?: string }

export function Tool(options: ToolOptions): MethodDecorator {
  return (target, propertyKey) =>
    addToMap(TOOL_KEY, target.constructor, String(propertyKey), options);
}

export function getToolMeta(target: Function): Map<string, ToolOptions> {
  return getMeta(TOOL_KEY, target, new Map());
}
