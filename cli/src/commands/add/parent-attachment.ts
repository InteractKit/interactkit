import { dirname } from 'node:path';
import { writeFileSync, readFileSync } from 'node:fs';

/** Find the file containing a given entity class name. */
function findEntityFile(className: string): string | null {
  const { execSync } = require('node:child_process');
  try {
    const result = execSync(
      `grep -rl "export class ${className} " src/entities/`,
      { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] },
    ).trim();
    const files = result.split('\n').filter(Boolean);
    return files.length > 0 ? files[0] : null;
  } catch {
    return null;
  }
}

/** Add a child entity as @Component to a parent entity's source file. */
export function attachToParent(parentClassName: string, childClassName: string, childFilePath: string): boolean {
  const parentFile = findEntityFile(parentClassName);
  if (!parentFile) {
    console.error(`  Could not find entity "${parentClassName}" in src/entities/`);
    return false;
  }

  const parentContent = readFileSync(parentFile, 'utf-8');

  if (parentContent.includes(`private ${childClassName.charAt(0).toLowerCase() + childClassName.slice(1)}!: ${childClassName}`)) {
    console.log(`  Already attached to ${parentClassName}`);
    return true;
  }

  const parentDir = dirname(parentFile);
  let relativePath = childFilePath
    .replace(parentDir + '/', '')
    .replace(/\.ts$/, '.js');
  if (!relativePath.startsWith('.')) {
    relativePath = './' + relativePath;
  }

  const importLine = `import { ${childClassName} } from '${relativePath}';`;
  let updated = parentContent;

  const lastImportIdx = updated.lastIndexOf('\nimport ');
  if (lastImportIdx !== -1) {
    const lineEnd = updated.indexOf('\n', lastImportIdx + 1);
    updated = updated.slice(0, lineEnd + 1) + importLine + '\n' + updated.slice(lineEnd + 1);
  } else {
    updated = importLine + '\n' + updated;
  }

  const propName = childClassName.charAt(0).toLowerCase() + childClassName.slice(1);
  const componentLine = `  @Component() private ${propName}!: Remote<${childClassName}>;`;

  const classMatch = updated.match(new RegExp(`export class ${parentClassName}[^{]*\\{`));
  if (classMatch && classMatch.index !== undefined) {
    const braceIdx = updated.indexOf('{', classMatch.index);
    const afterBrace = braceIdx + 1;
    updated = updated.slice(0, afterBrace) + '\n' + componentLine + updated.slice(afterBrace);
  }

  // Ensure Component and Remote imports exist
  const ensureImport = (content: string, name: string): string => {
    const re = /import \{([^}]*)\} from '@interactkit\/sdk'/;
    const match = content.match(re);
    if (match && new RegExp(`\\b${name}\\b`).test(match[1])) return content;
    return content.replace(re, (_, imports) => {
      const cleaned = imports.trim().replace(/,\s*$/, '');
      return `import { ${cleaned}, ${name} } from '@interactkit/sdk'`;
    });
  };
  updated = ensureImport(updated, 'Component');
  updated = ensureImport(updated, 'type Remote');

  writeFileSync(parentFile, updated);
  return true;
}
