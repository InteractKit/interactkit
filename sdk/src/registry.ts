/**
 * Global registry singleton.
 * Set by the CLI-generated bootstrap, read by boot().
 * User code never touches this directly.
 */
let _registry: any = undefined;

export function setRegistry(registry: any): void {
  _registry = registry;
}

export function getRegistry(): any {
  return _registry;
}
