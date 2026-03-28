import { resolve, dirname, relative } from 'node:path';
import { readFileSync, writeFileSync } from 'node:fs';
import { Project } from 'ts-morph';
import { extractEntities } from '@/codegen/parser/index.js';

export interface AttachOpts {
  ref?: boolean;
}

/** Ensure an SDK import name is present in the file content. */
function ensureSDKImport(content: string, name: string): string {
  // Match the SDK import — use [^}]* to stay within one import statement's braces
  const sdkImportRe = /import \{([^}]*)\} from '@interactkit\/sdk'/;
  const sdkImportMatch = content.match(sdkImportRe);
  if (sdkImportMatch && new RegExp(`\\b${name}\\b`).test(sdkImportMatch[1])) return content;
  return content.replace(
    sdkImportRe,
    (_, imports) => {
      const cleaned = imports.trim().replace(/,\s*$/, '');
      return `import { ${cleaned}, ${name} } from '@interactkit/sdk'`;
    },
  );
}

export async function attachCommand(childName: string, parentName: string, opts: AttachOpts) {
  // ─── Parse the entity tree ──────────────────────────
  const cwd = process.cwd();
  const projectPath = resolve(cwd, './tsconfig.json');
  const project = new Project({ tsConfigFilePath: projectPath });
  const entities = extractEntities(project, { validate: false });

  const parentEntity = entities.find(e => e.className === parentName);
  if (!parentEntity) {
    console.error(`Entity "${parentName}" not found in the project.`);
    process.exit(1);
  }

  const childEntity = entities.find(e => e.className === childName);
  if (!childEntity) {
    console.error(`Entity "${childName}" not found in the project.`);
    process.exit(1);
  }

  // ─── Read and modify the parent source file ─────────
  const parentFile = parentEntity.sourceFile;
  const parentContent = readFileSync(parentFile, 'utf-8');

  const propName = childName.charAt(0).toLowerCase() + childName.slice(1);
  const decorator = opts.ref ? '@Ref()' : '@Component()';
  const decoratorImport = opts.ref ? 'Ref' : 'Component';

  if (parentContent.includes(`private ${propName}!:`)) {
    console.error(`"${childName}" is already attached to ${parentName}.`);
    process.exit(1);
  }

  // Always use Remote<T> — makes switching between local/distributed zero-effort
  const typeName = `Remote<${childName}>`;

  // Build relative import path from parent to child
  let relPath = relative(dirname(parentFile), childEntity.sourceFile).replace(/\.ts$/, '.js');
  if (!relPath.startsWith('.')) relPath = './' + relPath;
  const importLine = `import { ${childName} } from '${relPath}';`;

  let updated = parentContent;

  // Insert import after last import statement
  const lastImportIdx = updated.lastIndexOf('\nimport ');
  if (lastImportIdx !== -1) {
    const lineEnd = updated.indexOf('\n', lastImportIdx + 1);
    updated = updated.slice(0, lineEnd + 1) + importLine + '\n' + updated.slice(lineEnd + 1);
  } else {
    updated = importLine + '\n' + updated;
  }

  // Insert property after class opening brace
  const propertyLine = `  ${decorator} private ${propName}!: ${typeName};`;
  const classMatch = updated.match(new RegExp(`export class ${parentName}[^{]*\\{`));
  if (classMatch && classMatch.index !== undefined) {
    const braceIdx = updated.indexOf('{', classMatch.index);
    updated = updated.slice(0, braceIdx + 1) + '\n' + propertyLine + updated.slice(braceIdx + 1);
  }

  // Ensure decorator and Remote type imports exist in SDK import
  updated = ensureSDKImport(updated, decoratorImport);
  updated = ensureSDKImport(updated, 'type Remote');

  writeFileSync(parentFile, updated);

  const mode = opts.ref ? '@Ref' : '@Component';
  console.log(`\n▸ Attached ${childName} to ${parentName} as ${mode}`);
  console.log(`  Property: ${propName}: ${typeName}`);
  console.log('');
}
