import { resolve } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';

/**
 * Resolve the root entity from interactkit.config.ts when --root is not provided.
 * Parses the config file with regex to find: root: ClassName
 * Then finds which source file exports that class.
 * Returns a root string like "src/entities/agent:Agent" or undefined.
 */
export function resolveRootFromConfig(cwd: string, projectPath: string): string | undefined {
  const configPath = resolve(cwd, 'interactkit.config.ts');
  if (!existsSync(configPath)) return undefined;

  const content = readFileSync(configPath, 'utf-8');

  // Match: root: ClassName  or  root: ClassName,
  const rootMatch = content.match(/root\s*:\s*([A-Z][A-Za-z0-9_]*)/);
  if (!rootMatch) return undefined;

  const className = rootMatch[1];

  // Find the import that brings this class in
  // Match: import { ClassName } from './src/entities/agent.js'
  // or: import { ClassName } from './src/entities/agent'
  const importRegex = new RegExp(`import\\s*\\{[^}]*\\b${className}\\b[^}]*\\}\\s*from\\s*['"]([^'"]+)['"]`);
  const importMatch = content.match(importRegex);
  if (!importMatch) return undefined;

  let importPath = importMatch[1];

  // Normalize: remove leading ./, remove .js extension, ensure relative to project
  importPath = importPath.replace(/^\.\//, '').replace(/\.js$/, '');

  // The root flag format is "path/to/file:ClassName"
  return `${importPath}:${className}`;
}
