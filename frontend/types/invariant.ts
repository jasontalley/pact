/**
 * Type of invariant checker
 */
export type InvariantCheckType = 'builtin' | 'custom' | 'llm';

/**
 * Configuration for invariant checks
 */
export interface InvariantCheckConfig {
  /** For builtin: checker class name */
  checkerName?: string;
  /** For custom: JSON-based rules */
  rules?: Record<string, unknown>[];
  /** For LLM: prompt template */
  prompt?: string;
  /** LLM model to use (if applicable) */
  model?: string;
  /** Additional options */
  [key: string]: unknown;
}

/**
 * Invariant configuration entity
 */
export interface InvariantConfig {
  id: string;
  projectId: string | null;
  invariantId: string;
  name: string;
  description: string;
  isEnabled: boolean;
  isBlocking: boolean;
  checkType: InvariantCheckType;
  checkConfig: InvariantCheckConfig;
  errorMessage: string;
  suggestionPrompt: string | null;
  isBuiltin: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * DTO for creating a custom invariant
 */
export interface CreateInvariantDto {
  invariantId: string;
  name: string;
  description: string;
  checkType?: InvariantCheckType;
  checkConfig?: InvariantCheckConfig;
  errorMessage: string;
  suggestionPrompt?: string;
  projectId?: string;
  isEnabled?: boolean;
  isBlocking?: boolean;
}

/**
 * DTO for updating an invariant
 */
export interface UpdateInvariantDto {
  name?: string;
  description?: string;
  isEnabled?: boolean;
  isBlocking?: boolean;
  checkConfig?: InvariantCheckConfig;
  errorMessage?: string;
  suggestionPrompt?: string;
}
