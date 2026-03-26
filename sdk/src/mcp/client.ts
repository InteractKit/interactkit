import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import type { MCPOptions, MCPTransportConfig } from './decorators.js';

export interface MCPToolInfo {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

/**
 * Wraps the official MCP SDK client.
 * Handles connection, tool discovery, and tool invocation.
 */
export class MCPClientWrapper {
  private client: Client;
  private options: MCPOptions;
  private connected = false;

  constructor(options: MCPOptions) {
    this.options = options;
    this.client = new Client({
      name: 'interactkit',
      version: '0.1.0',
    });
  }

  /** Connect to the MCP server */
  async connect(): Promise<void> {
    const transport = this.createTransport(this.options.transport);

    const maxRetries = this.options.retryOnFailure !== false
      ? (this.options.maxRetries ?? 3)
      : 1;

    let lastError: Error | undefined;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await this.client.connect(transport);
        this.connected = true;
        return;
      } catch (err: any) {
        lastError = err;
        if (attempt < maxRetries) {
          // Wait before retry (exponential backoff: 1s, 2s, 4s...)
          await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt - 1)));
        }
      }
    }

    throw new Error(
      `Failed to connect to MCP server after ${maxRetries} attempts: ${lastError?.message}`
    );
  }

  /** Discover all available tools from the MCP server */
  async listTools(): Promise<MCPToolInfo[]> {
    if (!this.connected) throw new Error('MCP client not connected');

    const allTools: MCPToolInfo[] = [];
    let cursor: string | undefined;

    do {
      const result = await this.client.listTools(cursor ? { cursor } : undefined);
      for (const tool of result.tools) {
        // Filter by allowlist if specified
        if (this.options.tools && !this.options.tools.includes(tool.name)) {
          continue;
        }
        allTools.push({
          name: tool.name,
          description: tool.description ?? tool.name,
          inputSchema: tool.inputSchema as Record<string, unknown>,
        });
      }
      cursor = result.nextCursor;
    } while (cursor);

    return allTools;
  }

  /** Call a tool on the MCP server */
  async callTool(name: string, args: Record<string, unknown>): Promise<string> {
    if (!this.connected) throw new Error('MCP client not connected');

    const result = await this.client.callTool({ name, arguments: args });

    if (result.isError) {
      const errorText = Array.isArray(result.content)
        ? result.content.map((c: any) => c.text ?? '').join('')
        : String(result.content);
      throw new Error(`MCP tool "${name}" failed: ${errorText}`);
    }

    // Extract text content from the result
    if (result.structuredContent) {
      return JSON.stringify(result.structuredContent);
    }

    if (Array.isArray(result.content)) {
      return result.content
        .map((block: any) => {
          if (block.type === 'text') return block.text;
          if (block.type === 'image') return `[image: ${block.mimeType}]`;
          return JSON.stringify(block);
        })
        .join('');
    }

    return String(result.content ?? '');
  }

  /** Disconnect from the MCP server */
  async close(): Promise<void> {
    if (this.connected) {
      await this.client.close();
      this.connected = false;
    }
  }

  private createTransport(config: MCPTransportConfig) {
    switch (config.type) {
      case 'stdio':
        return new StdioClientTransport({
          command: config.command,
          args: config.args,
          env: config.env,
          cwd: config.cwd,
        });

      case 'http':
        return new StreamableHTTPClientTransport(
          new URL(config.url),
          { requestInit: config.headers ? { headers: config.headers } : undefined },
        );

      case 'sse':
        return new SSEClientTransport(
          new URL(config.url),
          { requestInit: config.headers ? { headers: config.headers } : undefined },
        );

      default:
        throw new Error(`Unknown MCP transport type: ${(config as any).type}`);
    }
  }
}
