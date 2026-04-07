/**
 * InteractKit XML Compiler
 *
 * Pipeline: parse XML → validate → infer peerVisible refs → generate output
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { parseXML } from './xml/parser.js';
import { validate } from './validator/index.js';
import { expandAutotools } from './expand-autotools.js';
import { inferPeerVisibleRefs } from './peer-visible.js';
import { generate } from './generator/index.js';
import { discoverMCPTools } from './mcp/discovery.js';
import type { GraphIR, EntityIR, ToolIR, ParamIR, StreamIR, ToolOutputIR } from './ir.js';

export { parseXML } from './xml/parser.js';
export { validate } from './validator/index.js';
export { inferPeerVisibleRefs } from './peer-visible.js';
export { generate } from './generator/index.js';
export { discoverMCPTools } from './mcp/discovery.js';
export type { GraphIR } from './ir.js';

/**
 * Parse one or more XML files into a merged GraphIR.
 */
export function parseFiles(paths: string[]): GraphIR {
  const merged: GraphIR = { version: '1', entities: [] };

  for (const path of paths) {
    const content = readFileSync(path, 'utf-8');
    const graph = parseXML(content);
    merged.version = graph.version;
    if (graph.root && !merged.root) merged.root = graph.root;
    merged.entities.push(...graph.entities);
  }

  return merged;
}

/**
 * Full compiler pipeline: parse → validate → infer refs → generate → write files.
 */
export async function compile(xmlPaths: string[], outDir: string): Promise<void> {
  // 1. Parse
  const ir = parseFiles(xmlPaths);

  if (ir.entities.length === 0) {
    throw new Error('No entities found in XML files');
  }

  // 2. Fetch schemas for remote entities
  const remoteEntities = ir.entities.filter(e => e.remote);
  if (remoteEntities.length > 0) {
    await fetchRemoteSchemas(ir, remoteEntities);
  }

  // 3. Expand autotools into full ToolIR entries
  expandAutotools(ir);

  // 3b. Expand long-term-memory entities with built-in tools
  expandMemoryEntities(ir);

  // 4. Validate
  const { errors, warnings } = validate(ir);

  for (const w of warnings) {
    console.warn(`[interactkit] ⚠ [${w.entity ?? ''}${w.field ? '.' + w.field : ''}] ${w.message}`);
  }

  if (errors.length > 0) {
    const msgs = errors.map(e =>
      `[${e.entity ?? ''}${e.field ? '.' + e.field : ''}] ${e.message}`
    );
    throw new Error(`Validation failed:\n${msgs.join('\n')}`);
  }

  // 5. MCP compile-time discovery (for type="mcp" entities)
  const hasMCP = ir.entities.some(e => e.type === 'mcp');
  if (hasMCP) {
    await discoverMCPTools(ir);
  }

  // 6. Infer peerVisible refs
  inferPeerVisibleRefs(ir);

  // 7. Generate
  const files = generate(ir);

  // 8. Write output
  mkdirSync(outDir, { recursive: true });
  for (const [filename, content] of Object.entries(files)) {
    writeFileSync(join(outDir, filename), content, 'utf-8');
  }

  console.log(`[interactkit] Generated ${Object.keys(files).length} files in ${outDir}`);
}

// ─── Long-term memory expansion ────────────────────────

function expandMemoryEntities(ir: GraphIR): void {
  for (const entity of ir.entities) {
    if (entity.type !== 'long-term-memory') continue;
    // Skip if user already defined these tools
    const existing = new Set(entity.tools.map(t => t.name));

    if (!existing.has('memorize')) {
      entity.tools.push({
        name: 'memorize',
        description: 'Store content in long-term memory',
        llmCallable: false,
        peerVisible: true,
        input: [
          { name: 'content', type: 'string', optional: false, children: [] },
          { name: 'tags', type: 'array', items: 'string', optional: true, children: [] },
        ],
        output: { type: 'object', params: [{ name: 'id', type: 'string', optional: false, children: [] }] },
      });
    }

    if (!existing.has('recall')) {
      entity.tools.push({
        name: 'recall',
        description: 'Search long-term memory by semantic similarity',
        llmCallable: false,
        peerVisible: true,
        input: [
          { name: 'query', type: 'string', optional: false, children: [] },
          { name: 'k', type: 'number', optional: true, children: [] },
          { name: 'tags', type: 'array', items: 'string', optional: true, children: [] },
          { name: 'scoreThreshold', type: 'number', optional: true, children: [] },
        ],
        output: { type: 'array', items: 'object', params: [
          { name: 'id', type: 'string', optional: false, children: [] },
          { name: 'content', type: 'string', optional: false, children: [] },
          { name: 'score', type: 'number', optional: false, children: [] },
          { name: 'tags', type: 'array', items: 'string', optional: false, children: [] },
        ] },
      });
    }

    if (!existing.has('forget')) {
      entity.tools.push({
        name: 'forget',
        description: 'Delete entries from long-term memory',
        llmCallable: false,
        peerVisible: true,
        input: [
          { name: 'ids', type: 'array', items: 'string', optional: true, children: [] },
        ],
        output: { type: 'object', params: [{ name: 'deleted', type: 'number', optional: false, children: [] }] },
      });
    }
  }
}

// ─── Remote schema fetching ────────────────────────────

async function fetchRemoteSchemas(ir: GraphIR, remoteEntities: EntityIR[]): Promise<void> {
  for (const entity of remoteEntities) {
    const url = `${entity.remote!.replace(/\/$/, '')}/schema`;
    console.log(`[interactkit] Fetching schema from ${url}...`);

    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      const schema = await res.json() as any;

      // Populate entity with remote schema data
      entity.tools = (schema.methods ?? []).map(schemaMethodToToolIR);
      entity.streams = (schema.streams ?? []).map((s: any): StreamIR => ({
        name: s.name,
        type: 'string',
        params: [],
      }));

      // If the remote root has components, add their tools as nested entities
      for (const comp of (schema.components ?? [])) {
        const childEntity: EntityIR = {
          name: comp.schema.name,
          type: 'base',
          description: comp.schema.describe,
          remote: entity.remote,
          state: [],
          fieldGroups: [],
          secrets: [],
          components: [],
          refs: [],
          tools: (comp.schema.methods ?? []).map(schemaMethodToToolIR),
          autotools: [],
          streams: (comp.schema.streams ?? []).map((s: any): StreamIR => ({
            name: s.name,
            type: 'string',
            params: [],
          })),
        };

        // Add child entity to the graph if not already present
        if (!ir.entities.find(e => e.name === childEntity.name)) {
          ir.entities.push(childEntity);
        }

        // Add component reference to the remote entity
        entity.components.push({
          name: comp.name,
          entity: childEntity.name,
        });
      }

      if (schema.executor) {
        entity.executor = {
          provider: schema.executor.provider,
          model: schema.executor.model,
          temperature: schema.executor.temperature,
          maxTokens: schema.executor.maxTokens,
        };
      }

      console.log(`[interactkit] Remote "${entity.name}": ${entity.tools.length} tools, ${entity.components.length} components`);
    } catch (err: any) {
      throw new Error(`Failed to fetch schema for remote entity "${entity.name}" from ${url}: ${err.message}`);
    }
  }
}

function schemaMethodToToolIR(m: any): ToolIR {
  const input: ParamIR[] = (m.input?.fields ?? []).map((f: any): ParamIR => ({
    name: f.name,
    type: f.type === 'string' || f.type === 'number' || f.type === 'boolean' ? f.type : 'string',
    optional: f.optional ?? false,
    children: [],
  }));

  const output: ToolOutputIR = m.auto
    ? { type: 'string', params: [] }
    : { type: 'string', params: [] };

  return {
    name: m.name,
    description: m.description ?? m.name,
    llmCallable: false,
    peerVisible: false,
    input,
    output,
  };
}
