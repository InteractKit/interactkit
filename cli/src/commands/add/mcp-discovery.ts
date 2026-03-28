export interface MCPToolInfo {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface MCPAddOpts {
  command: string;
  args?: string[];
  url?: string;
  headers?: Record<string, string>;
  env?: Record<string, string>;
}

/** Connect to an MCP server and discover its available tools. */
export async function discoverMCPTools(opts: MCPAddOpts): Promise<MCPToolInfo[]> {
  const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
  const client = new Client({ name: 'interactkit-cli', version: '0.2.0' });

  let transport: any;
  if (opts.url) {
    const { StreamableHTTPClientTransport } = await import('@modelcontextprotocol/sdk/client/streamableHttp.js');
    transport = new StreamableHTTPClientTransport(
      new URL(opts.url),
      { requestInit: opts.headers ? { headers: opts.headers } : undefined },
    );
  } else {
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
