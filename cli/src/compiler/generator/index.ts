/**
 * Code generation orchestrator.
 *
 * Takes a validated GraphIR and produces all output files.
 */

import type { GraphIR } from '../ir.js';
import { generateTree } from './tree.js';
import { generateRegistry } from './registry.js';
import { generateTypes } from './types.js';
import { generateGraph } from './graph.js';
import { generateHandlers } from './handlers.js';

export interface GeneratedFiles {
  [filename: string]: string;
}

export function generate(graph: GraphIR): GeneratedFiles {
  const files: GeneratedFiles = {
    'tree.ts': generateTree(graph),
    'registry.ts': generateRegistry(graph),
    'types.ts': generateTypes(graph),
    'graph.ts': generateGraph(graph),
  };

  const handlers = generateHandlers(graph);
  if (handlers) {
    files['handlers.ts'] = handlers;
  }

  return files;
}
