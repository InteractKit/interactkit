import type { SubValidator } from '../types/sub-validator.js';

/** Hooks must have a runner, typed input, and always use Remote<T> on input. */
export const validateHooks: SubValidator = (entity, _ctx) => {
  const errors: string[] = [];
  const loc = `${entity.className} (${entity.type})`;

  for (const hook of entity.hooks) {
    if (!hook.runnerExport) {
      errors.push(`${loc}: @Hook "${hook.methodName}" requires a runner — e.g. @Hook(Init.Runner())`);
    }
    if (!hook.hookTypeName || hook.hookTypeName === '__type') {
      errors.push(`${loc}: @Hook "${hook.methodName}" has no typed parameter — e.g. (input: Init.Input)`);
    }

    // All hook inputs must use Remote<T> for consistency
    if (!hook.isRemoteInput && !hook.inProcess) {
      errors.push(
        `${loc}: @Hook "${hook.methodName}" input must be typed as Remote<${hook.hookTypeName}.Input> — ` +
        `this ensures switching between local and distributed requires no code changes`,
      );
    }
  }

  return errors;
};
