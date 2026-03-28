import { mapPropertyDecorator, getMeta } from './helpers.js';
import { CONFIGURABLE_KEY } from './keys.js';

export interface ConfigurableOptions {
  label: string;
  group?: string;
  description?: string;
  enum?: readonly string[] | readonly number[];
  validation?: unknown;
  defaultValue?: unknown;
  hidden?: boolean;
  readOnly?: boolean;
}

export function Configurable(options: ConfigurableOptions): PropertyDecorator {
  return mapPropertyDecorator(CONFIGURABLE_KEY, options);
}

export function getConfigurableMeta(target: Function): Map<string, ConfigurableOptions> {
  return getMeta(CONFIGURABLE_KEY, target, new Map());
}
