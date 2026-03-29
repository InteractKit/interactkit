import { resolve, dirname } from 'node:path';
import { writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { parseName } from './name-parser.js';
import { attachToParent } from './parent-attachment.js';
import { discoverMCPTools, type MCPAddOpts } from './mcp-discovery.js';
import { entityTemplate } from './templates/entity.js';
import { llmTemplate } from './templates/llm.js';
import { mcpTemplate } from './templates/mcp.js';

export interface AddOpts {
  llm?: boolean;
  attach?: string;
  detached?: boolean;
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
    console.error('  --mcp-stdio <cmd>      Generate entity from MCP server via stdio');
    console.error('  --mcp-http <url>       Generate entity from MCP server via HTTP');
    console.error('  --mcp-header <k=v>     Add header for MCP connection (repeatable)');
    console.error('  --mcp-env <k=v>        Add env var for stdio MCP server (repeatable)');
    console.error('  --detached             Mark entity as detached (uses remote pubsub from config)');
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
      code = mcpTemplate(className, transportCode, tools, opts.detached);
    } catch (err: any) {
      console.error(`  Failed to connect: ${err.message}`);
      process.exit(1);
    }

    console.log(`\n▸ Created MCP entity: ${relPath}`);
  } else if (opts.llm) {
    code = llmTemplate(className, entityType, opts.detached);
    console.log(`\n▸ Created LLM entity: ${relPath}`);
  } else {
    code = entityTemplate(className, entityType, opts.detached);
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
