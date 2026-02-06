/**
 * MCP Tool Registry
 *
 * Central registry of all MCP tools for the Pact MCP server.
 */

export interface ToolContent {
  type: 'text';
  text: string;
}

export interface ToolResult {
  content: ToolContent[];
  isError?: boolean;
}

export interface ToolInputSchema {
  type: 'object';
  properties: Record<string, unknown>;
  required?: string[];
}

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: ToolInputSchema;
  handler: (args: Record<string, unknown>) => Promise<ToolResult>;
}

// Import all tools
import { readAtomTool } from './read-atom.tool';
import { listAtomsTool } from './list-atoms.tool';
import { getAtomForTestTool } from './get-atom-for-test.tool';
import { searchAtomsTool } from './search-atoms.tool';
import { getCouplingStatusTool } from './get-coupling-status.tool';
import { getEpistemicStatusTool } from './get-epistemic-status.tool';
import { getIntentHistoryTool } from './get-intent-history.tool';
import { getConflictsTool } from './get-conflicts.tool';
import { suggestAtomTool } from './suggest-atom.tool';
import { getImplementableAtomsTool } from './get-implementable-atoms.tool';

/**
 * All registered MCP tools.
 */
export const allTools: ToolDefinition[] = [
  // Core tools
  readAtomTool,
  listAtomsTool,
  getAtomForTestTool,
  searchAtomsTool,
  // Agent tools (Phase 18)
  suggestAtomTool,
  getImplementableAtomsTool,
  // Coupling tools
  getCouplingStatusTool,
  // Epistemic tools
  getEpistemicStatusTool,
  getIntentHistoryTool,
  getConflictsTool,
];

/**
 * Map of tool name to handler for efficient lookup.
 */
export const toolHandlers: Map<string, ToolDefinition['handler']> = new Map(
  allTools.map((tool) => [tool.name, tool.handler]),
);

/**
 * Tool definitions for MCP ListTools response.
 */
export const toolDefinitions = allTools.map(({ name, description, inputSchema }) => ({
  name,
  description,
  inputSchema,
}));
