import type { SubValidator } from '../types/sub-validator.js';

/** MCP entities must have a transport config. */
export const validateMCP: SubValidator = (entity) => {
  if (entity.mcp.isMCPEntity && !entity.mcp.transport) {
    const loc = `${entity.className} (${entity.type})`;
    return [`${loc}: @MCP requires a transport config (e.g. @MCP({ transport: { type: 'http', url: '...' } }))`];
  }
  return [];
};
