import { resolve, dirname } from 'node:path';
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';

function entityTemplate(name: string, type: string) {
  return `import { Entity, BaseEntity, Hook, Init, State, Tool } from '@interactkit/sdk';

@Entity({ type: '${type}' })
export class ${name} extends BaseEntity {
  @Hook(Init.Runner())
  async onInit(input: Init.Input) {
    console.log(\`[\${this.id}] ${name} initialized\`);
  }
}
`;
}

function llmTemplate(name: string, _type: string) {
  return `import {
  Entity, LLMEntity, Hook, Init, State,
  Executor, Tool, SystemPrompt,
} from '@interactkit/sdk';

@Entity({ description: 'TODO: describe this entity' })
export class ${name} extends LLMEntity {
  @SystemPrompt()
  private systemPrompt = 'You are a helpful assistant.';

  @Executor()
  private llm: any = null; // Replace with: new ChatOpenAI({ model: 'gpt-4' })

  @Hook(Init.Runner())
  async onInit(input: Init.Input) {
    console.log(\`[\${this.id}] ${name} initialized\`);
  }

  @Tool({ description: 'TODO: describe what this tool does' })
  async doSomething(input: { query: string }): Promise<string> {
    return \`Processing: \${input.query}\`;
  }
}
`;
}

/**
 * Parse a dot-separated name like "researcher.Browser" into path segments and class name.
 *
 *   "Browser"              → { segments: [],             className: "Browser", fileName: "browser" }
 *   "researcher.Browser"   → { segments: ["researcher"], className: "Browser", fileName: "browser" }
 *   "agent.tools.Browser"  → { segments: ["agent","tools"], className: "Browser", fileName: "browser" }
 */
function parseName(input: string) {
  const parts = input.split('.');
  const rawName = parts.pop()!;
  const className = rawName.charAt(0).toUpperCase() + rawName.slice(1);
  const fileName = rawName.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
  const segments = parts.map(s => s.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase());
  const entityType = fileName;
  return { segments, className, fileName, entityType };
}

/**
 * Find an entity file by class name. Searches src/entities/ recursively.
 */
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

/**
 * Add a @Component() line to a parent entity file.
 */
function attachToParent(parentClassName: string, childClassName: string, childFilePath: string) {
  const parentFile = findEntityFile(parentClassName);
  if (!parentFile) {
    console.error(`  Could not find entity "${parentClassName}" in src/entities/`);
    return false;
  }

  const parentContent = readFileSync(parentFile, 'utf-8');

  // Check if already attached
  if (parentContent.includes(`private ${childClassName.charAt(0).toLowerCase() + childClassName.slice(1)}!: ${childClassName}`)) {
    console.log(`  Already attached to ${parentClassName}`);
    return true;
  }

  // Calculate relative import path from parent file to child file
  const parentDir = dirname(parentFile);
  let relativePath = childFilePath
    .replace(parentDir + '/', '')
    .replace(/\.ts$/, '.js');
  if (!relativePath.startsWith('.')) {
    relativePath = './' + relativePath;
  }

  // Add import
  const importLine = `import { ${childClassName} } from '${relativePath}';`;
  let updated = parentContent;

  // Insert import after the last existing import
  const lastImportIdx = updated.lastIndexOf('\nimport ');
  if (lastImportIdx !== -1) {
    const lineEnd = updated.indexOf('\n', lastImportIdx + 1);
    updated = updated.slice(0, lineEnd + 1) + importLine + '\n' + updated.slice(lineEnd + 1);
  } else {
    updated = importLine + '\n' + updated;
  }

  // Add @Component() line after the class opening brace
  const propName = childClassName.charAt(0).toLowerCase() + childClassName.slice(1);
  const componentLine = `  @Component() private ${propName}!: ${childClassName};`;

  // Find the class body opening
  const classMatch = updated.match(new RegExp(`export class ${parentClassName}[^{]*\\{`));
  if (classMatch && classMatch.index !== undefined) {
    const braceIdx = updated.indexOf('{', classMatch.index);
    const afterBrace = braceIdx + 1;
    updated = updated.slice(0, afterBrace) + '\n' + componentLine + updated.slice(afterBrace);
  }

  // Make sure Component is imported from SDK
  if (!updated.includes('Component')) {
    updated = updated.replace(
      /from '@interactkit\/sdk'/,
      (match) => match.replace("'@interactkit/sdk'", "'@interactkit/sdk'"),
    );
    // Add Component to the import
    updated = updated.replace(
      /import \{([^}]+)\} from '@interactkit\/sdk'/,
      (_, imports) => `import {${imports.trim()}, Component } from '@interactkit/sdk'`,
    );
  }

  writeFileSync(parentFile, updated);
  return true;
}

export async function addCommand(name: string, opts: { llm?: boolean; attach?: string }) {
  if (!name) {
    console.error('Usage: interactkit add <name> [--llm] [--attach ParentEntity]');
    console.error('');
    console.error('  name       Entity name, dot-separated for nesting (e.g. researcher.Browser)');
    console.error('  --llm      Generate an LLM entity extending LLMEntity with @Executor, @SystemPrompt');
    console.error('  --attach   Auto-add as @Component to a parent entity');
    process.exit(1);
  }

  const { segments, className, fileName, entityType } = parseName(name);

  // Build file path: src/entities/[segments]/[fileName].ts
  const pathParts = ['src', 'entities', ...segments, `${fileName}.ts`];
  const relPath = pathParts.join('/');
  const filePath = resolve(process.cwd(), relPath);

  if (existsSync(filePath)) {
    console.error(`File already exists: ${relPath}`);
    process.exit(1);
  }

  // Create directories if needed
  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  // Generate from template
  const template = opts.llm ? llmTemplate : entityTemplate;
  const code = template(className, entityType);
  writeFileSync(filePath, code);

  console.log(`\n▸ Created ${opts.llm ? 'LLM entity' : 'entity'}: ${relPath}`);
  console.log(`  Class: ${className}`);
  console.log(`  Type:  '${entityType}'`);

  // Attach to parent if requested
  if (opts.attach) {
    const attached = attachToParent(opts.attach, className, relPath);
    if (attached) {
      console.log(`  Attached to: ${opts.attach} as @Component`);
    }
  }

  console.log('');
}
