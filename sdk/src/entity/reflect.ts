import type { EntityConstructor } from './types.js';

export function getPropertyNames(EntityClass: EntityConstructor, entityReg?: any): string[] {
  const names = new Set<string>();
  const instance = new EntityClass();

  // Own properties from the instance (those with initializers)
  for (const key of Object.getOwnPropertyNames(instance)) {
    if (key !== 'id') names.add(key);
  }

  // Properties from registry (catches `!` properties with no initializer)
  if (entityReg) {
    for (const comp of entityReg.components ?? []) names.add(comp.property ?? comp);
    for (const stream of entityReg.streams ?? []) names.add(stream);
    for (const ref of entityReg.refs ?? []) names.add(ref);
    // State properties from registry state schema
    if (entityReg.state?.shape) {
      for (const key of Object.keys(entityReg.state.shape)) names.add(key);
    }
  }

  // Properties with design:type metadata (from decorators)
  const prototype = EntityClass.prototype;
  for (const key of Object.getOwnPropertyNames(prototype)) {
    if (key === 'constructor') continue;
    const designType = Reflect.getMetadata('design:type', prototype, key);
    if (designType && typeof designType === 'function' && designType !== Function) {
      names.add(key);
    }
  }

  return [...names];
}

export function getMethodNames(EntityClass: EntityConstructor): string[] {
  const names = new Set<string>();
  let prototype = EntityClass.prototype;
  while (prototype && prototype !== Object.prototype) {
    for (const key of Object.getOwnPropertyNames(prototype)) {
      if (key === 'constructor') continue;
      const desc = Object.getOwnPropertyDescriptor(prototype, key);
      if (desc && typeof desc.value === 'function') {
        names.add(key);
      }
    }
    prototype = Object.getPrototypeOf(prototype);
  }
  return [...names];
}
