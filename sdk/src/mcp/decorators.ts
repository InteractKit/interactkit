import 'reflect-metadata';

const MCP_META_KEY = Symbol('mcp:meta');

// ─── Transport types ─────────────────────────────────────

export interface MCPStdioTransport {
  type: 'stdio';
  /** Command to spawn the MCP server process */
  command: string;
  /** Arguments to pass to the command */
  args?: string[];
  /** Environment variables for the child process */
  env?: Record<string, string>;
  /** Working directory for the child process */
  cwd?: string;
}

export interface MCPHttpTransport {
  type: 'http';
  /** URL of the MCP server (e.g. http://localhost:3001/mcp) */
  url: string;
  /** Custom headers (e.g. for auth tokens) */
  headers?: Record<string, string>;
}

export interface MCPSseTransport {
  type: 'sse';
  /** URL of the SSE MCP server */
  url: string;
  /** Custom headers */
  headers?: Record<string, string>;
}

export type MCPTransportConfig = MCPStdioTransport | MCPHttpTransport | MCPSseTransport;

// ─── @MCP options ────────────────────────────────────────

export interface MCPOptions {
  /** Transport configuration — how to connect to the MCP server */
  transport: MCPTransportConfig;

  /**
   * Only expose these tools from the MCP server.
   * If omitted, all tools are exposed.
   */
  tools?: string[];

  /**
   * Prefix for tool names (e.g. 'slack' → 'slack.sendMessage').
   * Defaults to the entity property name.
   */
  toolPrefix?: string;

  /**
   * Timeout in ms for connecting to the MCP server.
   * @default 10000
   */
  connectTimeout?: number;

  /**
   * Timeout in ms for individual tool calls.
   * @default 30000
   */
  callTimeout?: number;

  /**
   * Retry connecting on failure.
   * @default true
   */
  retryOnFailure?: boolean;

  /**
   * Max retry attempts for connection.
   * @default 3
   */
  maxRetries?: number;
}

// ─── @MCP decorator ──────────────────────────────────────

/**
 * Marks an entity as an MCP (Model Context Protocol) bridge.
 * At boot time, the runtime connects to the MCP server,
 * discovers its tools, and registers them as @Tool methods
 * on this entity — so they're available to the LLM automatically.
 *
 * Use alongside @Entity():
 *
 * ```typescript
 * @MCP({
 *   transport: { type: 'http', url: 'http://localhost:3001/mcp' },
 * })
 * @Entity()
 * class SlackMCP extends BaseEntity {}
 * ```
 */
export function MCP(options: MCPOptions): ClassDecorator {
  return function (target: Function) {
    Reflect.defineMetadata(MCP_META_KEY, options, target);
  };
}

// ─── Reflection helper ───────────────────────────────────

export function getMCPMeta(target: Function): MCPOptions | undefined {
  return Reflect.getOwnMetadata(MCP_META_KEY, target);
}
