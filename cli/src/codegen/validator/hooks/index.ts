import type { SubValidator } from '../types/sub-validator.js';
import { usesRemotePubsub } from '../types/infra-helpers.js';

/** Hooks must have a runner, typed input, and use Remote<T> for remote hooks. */
export const validateHooks: SubValidator = (entity, ctx) => {
  const errors: string[] = [];
  const loc = `${entity.className} (${entity.type})`;

  for (const hook of entity.hooks) {
    if (!hook.runnerExport) {
      errors.push(`${loc}: @Hook "${hook.methodName}" requires a runner — e.g. @Hook(Init.Runner())`);
    }
    if (!hook.hookTypeName || hook.hookTypeName === '__type') {
      errors.push(`${loc}: @Hook "${hook.methodName}" has no typed parameter — e.g. (input: Init.Input)`);
    }

    // Non-local hooks on entities with remote pubsub: input is proxied, must use Remote<T>
    if (!hook.inProcess && usesRemotePubsub(entity, ctx.entities) && !hook.isRemoteInput) {
      errors.push(
        `${loc}: @Hook "${hook.methodName}" runs out-of-process on a remote pubsub — ` +
        `type input as Remote<${hook.hookTypeName}.Input> for type-safe proxy access`,
      );
    }
  }

  return errors;
};
