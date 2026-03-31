import type { HookRunner, HookHandler } from '../../hooks/runner.js';
import { pushToArray, getMeta } from './helpers.js';
import { HOOK_KEY } from './keys.js';

export interface HookMetaEntry {
  method: string;
  runnerClass: new (...args: any[]) => HookRunner<any>;
  config: Record<string, unknown>;
  initConfig?: Record<string, unknown>;
  inProcess: boolean;
}

export function Hook(handler: HookHandler): MethodDecorator {
  return (target, propertyKey) =>
    pushToArray<HookMetaEntry>(HOOK_KEY, target.constructor, {
      method: String(propertyKey),
      runnerClass: handler.runnerClass,
      config: handler.config,
      initConfig: handler.initConfig,
      inProcess: handler.inProcess,
    });
}

export function getHookMeta(target: Function): HookMetaEntry[] {
  return getMeta(HOOK_KEY, target, []);
}
