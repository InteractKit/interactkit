/**
 * Expand autotools into full ToolIR entries.
 *
 * For each autotool, generates the appropriate input/output params
 * from the referenced fieldGroup and injects them into entity.tools.
 * Runs after parsing, before validation.
 */

import type { GraphIR, EntityIR, FieldGroupIR, ToolIR, ParamIR, ToolOutputIR, AutoToolIR } from './ir.js';

export function expandAutotools(graph: GraphIR): void {
  for (const entity of graph.entities) {
    const expanded: ToolIR[] = [];

    for (const at of entity.autotools) {
      const fg = entity.fieldGroups.find(g => g.name === at.on);
      if (!fg) {
        throw new Error(`Entity "${entity.name}": autotool "${at.name}" references unknown fieldGroup "${at.on}"`);
      }
      expanded.push(expandOne(at, fg));
    }

    entity.tools.push(...expanded);
  }
}

function expandOne(at: AutoToolIR, fg: FieldGroupIR): ToolIR {
  const singular = fg.name.replace(/s$/, '');
  const desc = autoDescription(at.op, singular, fg.name, at.key);

  switch (at.op) {
    case 'create':
      return {
        name: at.name,
        description: desc,
        llmCallable: at.llmCallable,
        peerVisible: at.peerVisible,
        input: fieldsToParams(fg.fields),
        output: { type: 'string', params: [] }, // returns id
        auto: 'create', on: fg.name, key: fg.key,
      } as any;

    case 'read':
      return {
        name: at.name,
        description: desc,
        llmCallable: at.llmCallable,
        peerVisible: at.peerVisible,
        input: [{ name: at.key ?? fg.key, type: 'string', optional: false, children: [] }],
        output: { type: 'object', params: [keyParam(fg.key), ...fieldsToParams(fg.fields)] },
        auto: 'read', on: fg.name, key: at.key ?? fg.key,
      } as any;

    case 'update':
      return {
        name: at.name,
        description: desc,
        llmCallable: at.llmCallable,
        peerVisible: at.peerVisible,
        input: [
          { name: at.key ?? fg.key, type: 'string', optional: false, children: [] },
          ...fieldsToParams(fg.fields).map(p => ({ ...p, optional: true })),
        ],
        output: { type: 'void', params: [] },
        auto: 'update', on: fg.name, key: at.key ?? fg.key,
      } as any;

    case 'delete':
      return {
        name: at.name,
        description: desc,
        llmCallable: at.llmCallable,
        peerVisible: at.peerVisible,
        input: [{ name: at.key ?? fg.key, type: 'string', optional: false, children: [] }],
        output: { type: 'void', params: [] },
        auto: 'delete', on: fg.name, key: at.key ?? fg.key,
      } as any;

    case 'list':
      return {
        name: at.name,
        description: desc,
        llmCallable: at.llmCallable,
        peerVisible: at.peerVisible,
        input: [],
        output: { type: 'array', items: 'object', params: [keyParam(fg.key), ...fieldsToParams(fg.fields)] },
        auto: 'list', on: fg.name,
      } as any;

    case 'search':
      return {
        name: at.name,
        description: desc,
        llmCallable: at.llmCallable,
        peerVisible: at.peerVisible,
        input: [{ name: at.key ?? 'query', type: 'string', optional: false, children: [] }],
        output: { type: 'array', items: 'object', params: [keyParam(fg.key), ...fieldsToParams(fg.fields)] },
        auto: 'search', on: fg.name, key: at.key ?? 'query',
      } as any;

    case 'count':
      return {
        name: at.name,
        description: desc,
        llmCallable: at.llmCallable,
        peerVisible: at.peerVisible,
        input: [],
        output: { type: 'number', params: [] },
        auto: 'count', on: fg.name,
      } as any;

    default:
      throw new Error(`Unknown autotool op: "${at.op}"`);
  }
}

function fieldsToParams(fields: FieldGroupIR['fields']): ParamIR[] {
  return fields.map(f => ({
    name: f.name,
    type: f.type,
    description: f.description,
    optional: f.optional,
    items: f.items,
    values: f.values,
    validate: f.validate,
    children: f.children.map(c => ({
      name: c.name, type: c.type, description: c.description,
      optional: c.optional, items: c.items, values: c.values,
      validate: c.validate, children: [],
    })),
  }));
}

function keyParam(key: string): ParamIR {
  return { name: key, type: 'string', optional: false, children: [] };
}

function autoDescription(op: string, singular: string, plural: string, key?: string): string {
  switch (op) {
    case 'create': return `Create a new ${singular}`;
    case 'read': return `Get a ${singular} by ${key ?? 'id'}`;
    case 'update': return `Update a ${singular} by ${key ?? 'id'}`;
    case 'delete': return `Delete a ${singular} by ${key ?? 'id'}`;
    case 'list': return `List all ${plural}`;
    case 'search': return `Search ${plural}`;
    case 'count': return `Count ${plural}`;
    default: return op;
  }
}
