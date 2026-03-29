import type { MCPToolInfo } from '../mcp-discovery.js';

/** Convert a JSON Schema property type to a TypeScript type string. */
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

/** Build a TypeScript input type from a JSON Schema. */
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

/** Sanitize a tool name to be a valid JS identifier. */
function toMethodName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_]/g, '_').replace(/^(\d)/, '_$1');
}

/** Generate an MCP entity template from discovered tools. */
export function mcpTemplate(className: string, transportCode: string, tools: MCPToolInfo[], detached?: boolean): string {
  const lines: string[] = [];

  const entityOpts = detached
    ? `{ description: '${className} MCP — ${tools.length} tools', detached: true }`
    : `{ description: '${className} MCP — ${tools.length} tools' }`;

  lines.push(`import { Entity, BaseEntity, Hook, Init, Tool, MCPClientWrapper } from '@interactkit/sdk';`);
  lines.push('');
  lines.push(`@Entity(${entityOpts})`);
  lines.push(`export class ${className} extends BaseEntity {`);
  lines.push(`  private client = new MCPClientWrapper({`);
  lines.push(`    transport: ${transportCode},`);
  lines.push(`  });`);
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
