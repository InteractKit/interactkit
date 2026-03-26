import { ClassDeclaration } from 'ts-morph';
import type { MCPInfo } from '../types.js';

/** Extract @MCP decorator metadata from a class. */
export function extractMCPInfo(cls: ClassDeclaration): MCPInfo {
  const mcpDec = cls.getDecorator('MCP');
  if (!mcpDec) {
    return { isMCPEntity: false };
  }

  const args = mcpDec.getArguments();
  const transport = args[0]?.getText();

  return {
    isMCPEntity: true,
    transport,
  };
}
