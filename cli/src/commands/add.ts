import { resolve, dirname } from 'node:path';
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';

function entityTemplate(name: string, type: string) {
  return `import { Entity, BaseEntity, Hook, Init, State, Tool, Describe } from '@interactkit/sdk';

@Entity({ type: '${type}' })
export class ${name} extends BaseEntity {
  @Describe()
  describe() {
    return '${name} entity.';
  }

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
  Executor, Tool, Describe,
} from '@interactkit/sdk';
import { ChatOpenAI } from '@langchain/openai';

@Entity({ description: 'TODO: describe this entity' })
export class ${name} extends LLMEntity {
  @Describe()
  describe() {
    return 'You are a helpful assistant.';
  }

  @Executor()
  private llm = new ChatOpenAI({ model: 'gpt-4o-mini' });

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

// ─── MCP tool discovery + entity generation ─────────────

interface MCPToolInfo {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

interface MCPAddOpts {
  command: string;
  args?: string[];
  url?: string;
  headers?: Record<string, string>;
  env?: Record<string, string>;
}

async function discoverMCPTools(opts: MCPAddOpts): Promise<MCPToolInfo[]> {
  const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');

  const client = new Client({ name: 'interactkit-cli', version: '0.2.0' });

  let transport: any;
  if (opts.url) {
    // HTTP or SSE transport
    const { StreamableHTTPClientTransport } = await import('@modelcontextprotocol/sdk/client/streamableHttp.js');
    transport = new StreamableHTTPClientTransport(
      new URL(opts.url),
      { requestInit: opts.headers ? { headers: opts.headers } : undefined },
    );
  } else {
    // stdio transport
    const { StdioClientTransport } = await import('@modelcontextprotocol/sdk/client/stdio.js');
    transport = new StdioClientTransport({
      command: opts.command,
      args: opts.args,
      env: { ...process.env, ...opts.env } as Record<string, string>,
    });
  }

  await client.connect(transport);

  const allTools: MCPToolInfo[] = [];
  let cursor: string | undefined;
  do {
    const result = await client.listTools(cursor ? { cursor } : undefined);
    for (const tool of result.tools) {
      allTools.push({
        name: tool.name,
        description: tool.description ?? tool.name,
        inputSchema: tool.inputSchema as Record<string, unknown>,
      });
    }
    cursor = result.nextCursor;
  } while (cursor);

  await client.close();
  return allTools;
}

/** Convert a JSON Schema property type to a TypeScript type string */
function jsonSchemaToTS(prop: Record<string, unknown>): string {
  const type = prop.type as string | undefined;
  if (!type) return 'unknown';
  switch (type) {
    case 'string': return 'string';
    case 'number': case 'integer': return 'number';
    case 'boolean': return 'boolean';
    case 'array': {
      const items = prop.items as Record<string, unknown> | undefined;
      return items ? `${jsonSchemaToTS(items)}[]` : 'unknown[]';
    }
    case 'object': return 'Record<string, unknown>';
    default: return 'unknown';
  }
}

/** Build a TypeScript input type from a JSON Schema */
function buildInputType(schema: Record<string, unknown>): string {
  const properties = schema.properties as Record<string, Record<string, unknown>> | undefined;
  if (!properties || Object.keys(properties).length === 0) return '';

  const required = new Set(schema.required as string[] ?? []);
  const fields = Object.entries(properties).map(([key, prop]) => {
    const optional = required.has(key) ? '' : '?';
    return `${key}${optional}: ${jsonSchemaToTS(prop)}`;
  });
  return `{ ${fields.join('; ')} }`;
}

/** Sanitize a tool name to be a valid JS identifier */
function toMethodName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_]/g, '_').replace(/^(\d)/, '_$1');
}

function mcpTemplate(className: string, transportCode: string, tools: MCPToolInfo[]): string {
  const lines: string[] = [];

  lines.push(`import { Entity, BaseEntity, Hook, Init, Tool, Describe, MCPClientWrapper } from '@interactkit/sdk';`);
  lines.push('');
  lines.push(`@Entity({ description: '${className} MCP — ${tools.length} tools' })`);
  lines.push(`export class ${className} extends BaseEntity {`);
  lines.push(`  private client = new MCPClientWrapper({`);
  lines.push(`    transport: ${transportCode},`);
  lines.push(`  });`);
  lines.push('');
  lines.push(`  @Describe()`);
  lines.push(`  describe() {`);
  lines.push(`    return '${className} MCP integration with ${tools.length} tools.';`);
  lines.push(`  }`);
  lines.push('');
  lines.push(`  @Hook(Init.Runner())`);
  lines.push(`  async onInit(input: Init.Input) {`);
  lines.push(`    await this.client.connect();`);
  lines.push(`    console.log(\`[\${this.id}] ${className} connected — ${tools.length} tools\`);`);
  lines.push(`  }`);
  lines.push('');

  for (const tool of tools) {
    const method = toMethodName(tool.name);
    const inputType = buildInputType(tool.inputSchema);
    const params = inputType ? `input: ${inputType}` : '';
    const args = inputType ? 'input' : '{}';
    const desc = tool.description.replace(/'/g, "\\'");

    lines.push(`  @Tool({ description: '${desc}' })`);
    lines.push(`  async ${method}(${params}): Promise<string> {`);
    lines.push(`    return this.client.callTool('${tool.name}', ${args});`);
    lines.push(`  }`);
    lines.push('');
  }

  lines.push('}');
  lines.push('');
  return lines.join('\n');
}

// ─── Name parsing + parent attachment ───────────────────

/**
 * Parse a dot-separated name like "researcher.Browser" into path segments and class name.
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

function attachToParent(parentClassName: string, childClassName: string, childFilePath: string) {
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
  const componentLine = `  @Component() private ${propName}!: ${childClassName};`;

  const classMatch = updated.match(new RegExp(`export class ${parentClassName}[^{]*\\{`));
  if (classMatch && classMatch.index !== undefined) {
    const braceIdx = updated.indexOf('{', classMatch.index);
    const afterBrace = braceIdx + 1;
    updated = updated.slice(0, afterBrace) + '\n' + componentLine + updated.slice(afterBrace);
  }

  if (!updated.includes('Component')) {
    updated = updated.replace(
      /import \{([^}]+)\} from '@interactkit\/sdk'/,
      (_, imports) => `import {${imports.trim()}, Component } from '@interactkit/sdk'`,
    );
  }

  writeFileSync(parentFile, updated);
  return true;
}

// ─── Main command ───────────────────────────────────────

export interface AddOpts {
  llm?: boolean;
  attach?: string;
  mcpStdio?: string;
  mcpHttp?: string;
  mcpHeader?: string[];
  mcpEnv?: string[];
}

export async function addCommand(name: string, opts: AddOpts) {
  if (!name) {
    console.error('Usage: interactkit add <name> [options]');
    console.error('');
    console.error('  name                   Entity name, dot-separated for nesting (e.g. researcher.Browser)');
    console.error('  --llm                  Generate an LLM entity extending LLMEntity');
    console.error('  --attach <parent>      Auto-add as @Component to a parent entity');
    console.error('  --mcp-stdio <cmd>      Generate entity from MCP server via stdio (e.g. "npx -y @slack/mcp-server")');
    console.error('  --mcp-http <url>       Generate entity from MCP server via HTTP');
    console.error('  --mcp-header <k=v>     Add header for MCP connection (repeatable)');
    console.error('  --mcp-env <k=v>        Add env var for stdio MCP server (repeatable)');
    process.exit(1);
  }

  const { segments, className, fileName, entityType } = parseName(name);

  const pathParts = ['src', 'entities', ...segments, `${fileName}.ts`];
  const relPath = pathParts.join('/');
  const filePath = resolve(process.cwd(), relPath);

  if (existsSync(filePath)) {
    console.error(`File already exists: ${relPath}`);
    process.exit(1);
  }

  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  let code: string;

  if (opts.mcpStdio || opts.mcpHttp) {
    // ─── MCP mode ─────────────────────────────────────
    const headers: Record<string, string> = {};
    for (const h of opts.mcpHeader ?? []) {
      const eq = h.indexOf('=');
      if (eq > 0) headers[h.slice(0, eq)] = h.slice(eq + 1);
    }

    const env: Record<string, string> = {};
    for (const e of opts.mcpEnv ?? []) {
      const eq = e.indexOf('=');
      if (eq > 0) env[e.slice(0, eq)] = e.slice(eq + 1);
    }

    let transportCode: string;
    const mcpOpts: MCPAddOpts = { command: '', env };

    if (opts.mcpStdio) {
      const parts = opts.mcpStdio.split(/\s+/);
      mcpOpts.command = parts[0];
      mcpOpts.args = parts.slice(1);

      const argsStr = mcpOpts.args.length > 0
        ? `, args: [${mcpOpts.args.map(a => `'${a}'`).join(', ')}]`
        : '';
      const envStr = Object.keys(env).length > 0
        ? `, env: { ${Object.entries(env).map(([k, v]) => `'${k}': process.env['${k}'] ?? '${v}'`).join(', ')} }`
        : '';
      transportCode = `{ type: 'stdio', command: '${mcpOpts.command}'${argsStr}${envStr} }`;
    } else {
      mcpOpts.url = opts.mcpHttp!;
      mcpOpts.headers = Object.keys(headers).length > 0 ? headers : undefined;

      const headersStr = Object.keys(headers).length > 0
        ? `, headers: { ${Object.entries(headers).map(([k, v]) => `'${k}': process.env['${k.toUpperCase().replace(/-/g, '_')}'] ?? '${v}'`).join(', ')} }`
        : '';
      transportCode = `{ type: 'http', url: '${mcpOpts.url}'${headersStr} }`;
    }

    console.log(`\n▸ Connecting to MCP server...`);
    try {
      const tools = await discoverMCPTools(mcpOpts);
      console.log(`  Discovered ${tools.length} tools:`);
      for (const t of tools) {
        console.log(`    - ${t.name}: ${t.description.slice(0, 60)}`);
      }
      code = mcpTemplate(className, transportCode, tools);
    } catch (err: any) {
      console.error(`  Failed to connect: ${err.message}`);
      process.exit(1);
    }

    console.log(`\n▸ Created MCP entity: ${relPath}`);
  } else if (opts.llm) {
    code = llmTemplate(className, entityType);
    console.log(`\n▸ Created LLM entity: ${relPath}`);
  } else {
    code = entityTemplate(className, entityType);
    console.log(`\n▸ Created entity: ${relPath}`);
  }

  writeFileSync(filePath, code);
  console.log(`  Class: ${className}`);

  if (opts.attach) {
    const attached = attachToParent(opts.attach, className, relPath);
    if (attached) {
      console.log(`  Attached to: ${opts.attach} as @Component`);
    }
  }

  console.log('');
}
