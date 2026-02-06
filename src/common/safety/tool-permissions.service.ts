/**
 * Tool Permissions Service
 *
 * Manages per-agent tool access controls.
 * Agents can only use tools explicitly granted to their profile.
 */

import { Injectable, Logger } from '@nestjs/common';
import {
  TOOL_RISK_CLASSIFICATION,
  ToolRiskLevel,
  SafetyViolation,
  SafetyViolationType,
} from './constitution';

/**
 * Agent profile defining capabilities and permissions
 */
export interface AgentProfile {
  /** Unique identifier for the agent type */
  id: string;

  /** Human-readable name */
  name: string;

  /** Description of agent's purpose */
  description: string;

  /** Tools this agent is allowed to use */
  allowedTools: string[];

  /** Tool categories this agent can use (alternative to explicit list) */
  allowedToolCategories?: ToolRiskLevel[];

  /** Tools explicitly denied (overrides allowedTools) */
  deniedTools?: string[];

  /** Maximum tool calls per request for this agent */
  maxToolCallsPerRequest?: number;

  /** Custom limits for this agent */
  limits?: {
    maxInputLength?: number;
    maxOutputLength?: number;
    maxIterations?: number;
  };

  /** Whether this agent can access external resources */
  canAccessExternal?: boolean;

  /** Whether this agent can perform mutating operations */
  canMutate?: boolean;
}

/**
 * Built-in agent profiles
 */
export const AGENT_PROFILES: Record<string, AgentProfile> = {
  /**
   * Chat agent - general purpose assistant
   * Read-only access to filesystem, read-only atom operations
   */
  'chat-agent': {
    id: 'chat-agent',
    name: 'Chat Assistant',
    description: 'General purpose conversational assistant for exploring the codebase',
    allowedTools: [
      // Filesystem (read-only)
      'read_file',
      'list_directory',
      'grep',
      'find_files',
      // Atoms (read-only)
      'get_atom',
      'list_atoms',
      'search_atoms',
      // Analysis
      'analyze_intent',
      'quality_check',
    ],
    allowedToolCategories: [ToolRiskLevel.READ_ONLY],
    maxToolCallsPerRequest: 15,
    canAccessExternal: false,
    canMutate: false,
  },

  /**
   * Atomization agent - creates and refines atoms
   * Read access + atom creation/update
   */
  'atomization-agent': {
    id: 'atomization-agent',
    name: 'Atomization Assistant',
    description: 'Helps users create and refine intent atoms',
    allowedTools: [
      // Filesystem (read-only)
      'read_file',
      'list_directory',
      'grep',
      'find_files',
      // Atoms (read + write)
      'get_atom',
      'list_atoms',
      'search_atoms',
      'create_atom',
      'update_atom',
      // Analysis
      'analyze_intent',
      'quality_check',
    ],
    deniedTools: ['delete_atom', 'commit_atom'], // Cannot delete or commit
    maxToolCallsPerRequest: 20,
    canAccessExternal: false,
    canMutate: true,
  },

  /**
   * Quality agent - analyzes and reports on quality
   * Read-only access, focused on analysis tools
   */
  'quality-agent': {
    id: 'quality-agent',
    name: 'Quality Analyzer',
    description: 'Analyzes atom quality and provides improvement suggestions',
    allowedTools: [
      'read_file',
      'list_directory',
      'grep',
      'get_atom',
      'list_atoms',
      'search_atoms',
      'quality_check',
      'analyze_intent',
    ],
    maxToolCallsPerRequest: 10,
    canAccessExternal: false,
    canMutate: false,
  },

  /**
   * Commit agent - handles commitment ceremonies
   * Restricted agent with commit privileges
   */
  'commit-agent': {
    id: 'commit-agent',
    name: 'Commitment Ceremony Handler',
    description: 'Handles the commitment ceremony for atoms',
    allowedTools: ['get_atom', 'quality_check', 'commit_atom'],
    maxToolCallsPerRequest: 5,
    canAccessExternal: false,
    canMutate: true,
    limits: {
      maxInputLength: 10_000, // Shorter input for focused operations
      maxIterations: 3,
    },
  },

  /**
   * Exploration agent - deep codebase exploration
   * Extended read access with higher limits
   */
  'exploration-agent': {
    id: 'exploration-agent',
    name: 'Codebase Explorer',
    description: 'Performs deep exploration of the codebase',
    allowedTools: [
      'read_file',
      'list_directory',
      'grep',
      'find_files',
      'get_atom',
      'list_atoms',
      'search_atoms',
    ],
    maxToolCallsPerRequest: 25,
    canAccessExternal: false,
    canMutate: false,
    limits: {
      maxIterations: 8,
    },
  },
} as const;

/**
 * Default profile for unknown agents (most restrictive)
 */
export const DEFAULT_AGENT_PROFILE: AgentProfile = {
  id: 'unknown',
  name: 'Unknown Agent',
  description: 'Fallback profile with minimal permissions',
  allowedTools: ['list_directory', 'get_atom', 'list_atoms'],
  maxToolCallsPerRequest: 5,
  canAccessExternal: false,
  canMutate: false,
};

@Injectable()
export class ToolPermissionsService {
  private readonly logger = new Logger(ToolPermissionsService.name);
  private readonly profiles: Map<string, AgentProfile> = new Map();

  constructor() {
    // Load built-in profiles
    for (const [id, profile] of Object.entries(AGENT_PROFILES)) {
      this.profiles.set(id, profile);
    }
    this.logger.log(`Loaded ${this.profiles.size} agent profiles`);
  }

  /**
   * Get the profile for an agent
   */
  getProfile(agentId: string): AgentProfile {
    const profile = this.profiles.get(agentId);
    if (!profile) {
      this.logger.warn(`Unknown agent ID: ${agentId}, using default profile`);
      return DEFAULT_AGENT_PROFILE;
    }
    return profile;
  }

  /**
   * Register a custom agent profile
   */
  registerProfile(profile: AgentProfile): void {
    if (this.profiles.has(profile.id)) {
      this.logger.warn(`Overwriting existing profile: ${profile.id}`);
    }
    this.profiles.set(profile.id, profile);
    this.logger.log(`Registered agent profile: ${profile.id}`);
  }

  /**
   * Check if an agent can use a specific tool
   */
  canUseTool(agentId: string, toolName: string): boolean {
    const profile = this.getProfile(agentId);

    // Check explicit denial first
    if (profile.deniedTools?.includes(toolName)) {
      return false;
    }

    // Check explicit allowlist
    if (profile.allowedTools.includes(toolName)) {
      return true;
    }

    // Check category-based permission
    if (profile.allowedToolCategories) {
      const toolRisk = TOOL_RISK_CLASSIFICATION[toolName];
      if (toolRisk && profile.allowedToolCategories.includes(toolRisk)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Validate a list of tool calls for an agent
   */
  validateToolCalls(
    agentId: string,
    toolNames: string[],
  ): { allowed: string[]; denied: SafetyViolation[] } {
    const profile = this.getProfile(agentId);
    const allowed: string[] = [];
    const denied: SafetyViolation[] = [];

    // Check total count first
    if (toolNames.length > (profile.maxToolCallsPerRequest || 20)) {
      denied.push({
        type: SafetyViolationType.TOO_MANY_TOOL_CALLS,
        message: `Agent ${agentId} attempted ${toolNames.length} tool calls, max is ${profile.maxToolCallsPerRequest}`,
        severity: 'high',
        rule: 'maxToolCallsPerRequest',
      });
    }

    // Check each tool
    for (const toolName of toolNames) {
      if (this.canUseTool(agentId, toolName)) {
        allowed.push(toolName);
      } else {
        denied.push({
          type: SafetyViolationType.TOOL_NOT_PERMITTED,
          message: `Agent ${agentId} is not permitted to use tool: ${toolName}`,
          severity: 'high',
          rule: `allowedTools for ${agentId}`,
          content: toolName,
        });
      }
    }

    return { allowed, denied };
  }

  /**
   * Get all allowed tools for an agent
   */
  getAllowedTools(agentId: string): string[] {
    const profile = this.getProfile(agentId);
    const tools = new Set<string>(profile.allowedTools);

    // Add category-based tools
    if (profile.allowedToolCategories) {
      for (const [tool, risk] of Object.entries(TOOL_RISK_CLASSIFICATION)) {
        if (profile.allowedToolCategories.includes(risk)) {
          tools.add(tool);
        }
      }
    }

    // Remove denied tools
    if (profile.deniedTools) {
      for (const denied of profile.deniedTools) {
        tools.delete(denied);
      }
    }

    return Array.from(tools);
  }

  /**
   * Get limits for an agent
   */
  getLimits(agentId: string): AgentProfile['limits'] & { maxToolCallsPerRequest: number } {
    const profile = this.getProfile(agentId);
    return {
      ...profile.limits,
      maxToolCallsPerRequest: profile.maxToolCallsPerRequest || 20,
    };
  }

  /**
   * Check if agent can perform mutating operations
   */
  canMutate(agentId: string): boolean {
    return this.getProfile(agentId).canMutate || false;
  }

  /**
   * Check if agent can access external resources
   */
  canAccessExternal(agentId: string): boolean {
    return this.getProfile(agentId).canAccessExternal || false;
  }

  /**
   * List all registered profiles
   */
  listProfiles(): AgentProfile[] {
    return Array.from(this.profiles.values());
  }
}
