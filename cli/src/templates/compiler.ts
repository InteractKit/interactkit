/**
 * Compiles a JSON template into TypeScript entity files.
 */

export interface TemplateEntity {
  file: string;
  class: string;
  extends: 'BaseEntity' | 'LLMEntity';
  description: string;
  describe?: string;
  components?: Array<{ name: string; class: string; file: string }>;
  refs?: Array<{ name: string; class: string; file: string }>;
  state?: Array<{ name: string; type: string; default: string; description: string }>;
  hooks?: Array<{ type: string; config?: string; body: string; from?: string }>;
  tools?: Array<{ name: string; description: string; input: string | null; returns: string; body: string }>;
}

export interface TemplateDefinition {
  name: string;
  label: string;
  description: string;
  readme: string;
  root: { file: string; class: string };
  entities: TemplateEntity[];
  tree: string[];
  extraDeps?: Record<string, string>;
}

/** Compile a single entity definition to TypeScript source */
export function compileEntity(entity: TemplateEntity): string {
  const lines: string[] = [];

  // Collect imports
  const sdkImports = new Set<string>();
  const fileImports: Array<{ name: string; path: string }> = [];

  // Base class
  if (entity.extends === 'LLMEntity') {
    sdkImports.add('LLMEntity');
  } else {
    sdkImports.add('BaseEntity');
  }
  sdkImports.add('Entity');

  // Components
  if (entity.components?.length) {
    sdkImports.add('Component');
    for (const c of entity.components) {
      fileImports.push({ name: c.class, path: `./${c.file}.js` });
    }
  }

  // Refs
  if (entity.refs?.length) {
    sdkImports.add('Ref');
    for (const r of entity.refs) {
      fileImports.push({ name: r.class, path: `./${r.file}.js` });
    }
  }

  // State
  if (entity.state?.length) {
    sdkImports.add('State');
  }

  // Hooks
  const externalHookImports: Array<{ name: string; from: string }> = [];
  if (entity.hooks?.length) {
    sdkImports.add('Hook');
    for (const h of entity.hooks) {
      if (h.from) {
        externalHookImports.push({ name: h.type, from: h.from });
      } else {
        sdkImports.add(h.type);
      }
    }
  }

  // Tools
  if (entity.tools?.length) {
    sdkImports.add('Tool');
  }

  // LLM-specific
  if (entity.extends === 'LLMEntity') {
    sdkImports.add('Executor');
  }

  // @Describe
  if (entity.describe) {
    sdkImports.add('Describe');
  }

  // Database is now configured in interactkit.config.ts, not in @Entity

  // Deduplicate file imports (same class from same file)
  const seen = new Set<string>();
  const uniqueFileImports = fileImports.filter(f => {
    const key = `${f.name}:${f.path}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Write imports
  lines.push(`import { ${[...sdkImports].join(', ')} } from '@interactkit/sdk';`);
  if (entity.extends === 'LLMEntity') {
    lines.push(`import { ChatOpenAI } from '@langchain/openai';`);
  }
  for (const ext of externalHookImports) {
    lines.push(`import { ${ext.name} } from '${ext.from}';`);
  }
  for (const f of uniqueFileImports) {
    lines.push(`import { ${f.name} } from '${f.path}';`);
  }
  lines.push('');

  // Class declaration
  lines.push(`@Entity({ description: '${entity.description}' })`);
  lines.push(`export class ${entity.class} extends ${entity.extends} {`);

  // State properties
  if (entity.state?.length) {
    for (const s of entity.state) {
      lines.push(`  @State({ description: '${s.description}' })`);
      lines.push(`  private ${s.name}: ${s.type} = ${s.default};`);
      lines.push('');
    }
  }

  // @Describe method
  if (entity.describe) {
    lines.push(`  @Describe()`);
    lines.push(`  describe() {`);
    lines.push('    return `' + entity.describe + '`;');
    lines.push(`  }`);
    lines.push('');
  }

  // Executor (LLMEntity only)
  if (entity.extends === 'LLMEntity') {
    lines.push(`  @Executor()`);
    lines.push(`  private llm = new ChatOpenAI({ model: 'gpt-4o-mini' });`);
    lines.push('');
  }

  // Components
  if (entity.components?.length) {
    for (const c of entity.components) {
      lines.push(`  @Component() private ${c.name}!: ${c.class};`);
    }
    lines.push('');
  }

  // Refs
  if (entity.refs?.length) {
    for (const r of entity.refs) {
      lines.push(`  @Ref() private ${r.name}!: ${r.class};`);
    }
    lines.push('');
  }

  // Hooks
  if (entity.hooks?.length) {
    for (const h of entity.hooks) {
      const runner = h.config ? `${h.type}.Runner(${h.config})` : `${h.type}.Runner()`;
      const inputType = `${h.type}.Input`;
      lines.push(`  @Hook(${runner})`);
      lines.push(`  async on${h.type}(input: ${inputType}) {`);
      lines.push(`    ${h.body}`);
      lines.push(`  }`);
      lines.push('');
    }
  }

  // Tools
  if (entity.tools?.length) {
    for (const t of entity.tools) {
      lines.push(`  @Tool({ description: '${t.description}' })`);
      const params = t.input ? `input: ${t.input}` : '';
      lines.push(`  async ${t.name}(${params}): ${t.returns} {`);
      lines.push(`    ${t.body}`);
      lines.push(`  }`);
      lines.push('');
    }
  }

  lines.push('}');
  lines.push('');

  return lines.join('\n');
}

/** Generate a README from a template definition */
export function compileReadme(template: TemplateDefinition, projectName: string, hasDb: boolean): string {
  // Replace placeholders in the template readme
  return template.readme
    .replace(/\{\{name\}\}/g, projectName)
    .replace(/\{\{tree\}\}/g, template.tree.join('\n'))
    .replace(/\{\{setup\}\}/g, hasDb ? 'pnpm install\npnpm db:push' : 'pnpm install')
    .replace(/\{\{description\}\}/g, template.description);
}
