/**
 * MCP compile-time tool discovery.
 *
 * For entities with type="mcp", connects to the MCP server at compile time,
 * discovers available tools, and injects them into the entity's IR as ToolIR[].
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import type {
  GraphIR, EntityIR, McpIR, McpTransportIR,
  ToolIR, ParamIR, FieldTypeKind,
} from '../ir.js';

/**
 * Discover MCP tools for all type="mcp" entities and inject them into the IR.
 * Mutates the GraphIR in place.
 */
export async function discoverMCPTools(graph: GraphIR): Promise<void> {
  const mcpEntities = graph.entities.filter(e => e.type === 'mcp' && e.mcp);

  for (const entity of mcpEntities) {
    try {
      console.log(`[interactkit] Discovering MCP tools for ${entity.name}...`);
      const tools = await discoverForEntity(entity);
      entity.tools.push(...tools);
      console.log(`[interactkit]   Found ${tools.length} tool(s) for ${entity.name}`);
    } catch (err: any) {
      console.warn(`[interactkit]   Failed to discover tools for ${entity.name}: ${err.message}`);
    }
  }
}

async function discoverForEntity(entity: EntityIR): Promise<ToolIR[]> {
  const mcp = entity.mcp!;
  const client = new Client({ name: 'interactkit-compiler', version: '0.1.0' });
  const transport = createTransport(mcp.transport);

  const maxRetries = mcp.retry ? mcp.maxRetries : 1;
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await client.connect(transport);
      break;
    } catch (err: any) {
      lastError = err;
      if (attempt < maxRetries) {
        await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt - 1)));
      }
    }
  }

  if (!client) {
    throw lastError ?? new Error('Failed to connect to MCP server');
  }

  try {
    const allTools: ToolIR[] = [];
    let cursor: string | undefined;

    do {
      const result = await client.listTools(cursor ? { cursor } : undefined);

      for (const tool of result.tools) {
        // Filter by tools list if specified
        if (mcp.tools && !mcp.tools.includes(tool.name)) continue;

        const prefix = mcp.toolPrefix ? `${mcp.toolPrefix}_` : '';
        allTools.push(mcpToolToIR(tool, prefix));
      }

      cursor = result.nextCursor;
    } while (cursor);

    return allTools;
  } finally {
    await client.close().catch(() => {});
  }
}

/**
 * Convert an MCP tool schema to our ToolIR format.
 */
function mcpToolToIR(
  tool: { name: string; description?: string; inputSchema?: Record<string, unknown> },
  prefix: string,
): ToolIR {
  const input: ParamIR[] = [];

  // Parse JSON Schema properties from inputSchema
  const schema = tool.inputSchema as any;
  if (schema?.properties) {
    const required = new Set(schema.required ?? []);
    for (const [name, prop] of Object.entries(schema.properties) as [string, any][]) {
      input.push({
        name,
        type: jsonSchemaTypeToFieldType(prop.type),
        description: prop.description,
        optional: !required.has(name),
        items: prop.type === 'array' ? jsonSchemaTypeToFieldType(prop.items?.type) : undefined,
        values: undefined,
        validate: undefined,
        children: [],
      });
    }
  }

  return {
    name: `${prefix}${tool.name}`,
    description: tool.description ?? tool.name,
    llmCallable: true,
    peerVisible: false,
    input,
    output: { type: 'string', params: [] },
  };
}

function jsonSchemaTypeToFieldType(type?: string): FieldTypeKind {
  switch (type) {
    case 'string': return 'string';
    case 'number': case 'integer': return 'number';
    case 'boolean': return 'boolean';
    case 'array': return 'array';
    case 'object': return 'object';
    default: return 'string';
  }
}

function createTransport(config: McpTransportIR) {
  switch (config.type) {
    case 'stdio': {
      const env: Record<string, string> = { ...process.env as Record<string, string> };
      for (const { key, value } of config.env) {
        env[key] = value;
      }
      return new StdioClientTransport({
        command: config.command,
        args: config.args?.split(' '),
        env,
        cwd: config.cwd,
      });
    }
    case 'http': {
      const headers: Record<string, string> = {};
      for (const { key, value } of config.headers) {
        headers[key] = value;
      }
      return new StreamableHTTPClientTransport(
        new URL(config.url),
        Object.keys(headers).length > 0 ? { requestInit: { headers } } : undefined,
      );
    }
    case 'sse': {
      const headers: Record<string, string> = {};
      for (const { key, value } of config.headers) {
        headers[key] = value;
      }
      return new SSEClientTransport(
        new URL(config.url),
        Object.keys(headers).length > 0 ? { requestInit: { headers } } : undefined,
      );
    }
    default:
      throw new Error(`Unknown MCP transport type: ${(config as any).type}`);
  }
}
