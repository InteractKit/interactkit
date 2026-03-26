/**
 * Create a mock entity proxy that records all method calls
 * and returns configurable responses.
 *
 * Usage:
 *   const memory = mockEntity<Memory>();
 *   memory.on('store').returns(undefined);
 *   memory.on('search').returns(['result']);
 *
 *   // After test:
 *   expect(memory.calls('store')).toHaveLength(1);
 *   expect(memory.calls('store')[0]).toEqual({ text: 'hello' });
 */

export interface MockEntityProxy<T> {
  /** Configure a mock return value for a method */
  on(method: keyof T & string): { returns(value: any): void };
  /** Get recorded calls for a method */
  calls(method: keyof T & string): any[];
  /** Reset all recorded calls */
  reset(): void;
  /** The proxy object — use this as the entity reference */
  [key: string]: any;
}

export function mockEntity<T>(): MockEntityProxy<T> {
  const returnValues = new Map<string, any>();
  const recordedCalls = new Map<string, any[]>();

  const proxy = new Proxy(
    {} as any,
    {
      get(_target, prop) {
        if (typeof prop === 'symbol') return undefined;
        const name = String(prop);

        // Internal methods
        if (name === 'on') {
          return (method: string) => ({
            returns(value: any) {
              returnValues.set(method, value);
            },
          });
        }

        if (name === 'calls') {
          return (method: string) => recordedCalls.get(method) ?? [];
        }

        if (name === 'reset') {
          return () => recordedCalls.clear();
        }

        // id property
        if (name === 'id') return 'mock:0000';

        // Method call — record and return configured value
        return async (...args: unknown[]) => {
          const callArgs = args[0]; // entity methods take a single input object
          if (!recordedCalls.has(name)) recordedCalls.set(name, []);
          recordedCalls.get(name)!.push(callArgs);

          const value = returnValues.get(name);
          if (typeof value === 'function') return value(callArgs);
          return value;
        };
      },
    },
  );

  return proxy;
}
