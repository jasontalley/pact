/**
 * Model Routing Types
 *
 * Types for intelligent model selection based on task type,
 * cost constraints, and availability.
 */

import { AgentTaskType, LLMProviderType, ModelCapabilities } from '../providers/types';

/**
 * Fallback strategy when primary model/provider unavailable
 */
export type FallbackStrategy = 'next_model' | 'next_provider' | 'fail';

/**
 * Routing rule for a specific task type
 */
export interface RoutingRule {
  /** Task type this rule applies to */
  taskType: AgentTaskType;
  /** Ordered list of preferred providers (first = highest priority) */
  preferredProviders: LLMProviderType[];
  /** Ordered list of preferred models (first = highest priority) */
  preferredModels: string[];
  /** Minimum context window required (in tokens) */
  minContextWindow?: number;
  /** Whether function/tool calling is required */
  requiresFunctionCalling?: boolean;
  /** Maximum cost per request (in dollars) */
  maxCostPerRequest?: number;
  /** Reasoning effort for GPT-5.2 models */
  reasoningEffort?: 'none' | 'low' | 'medium' | 'high' | 'xhigh';
  /** Strategy when primary options unavailable */
  fallbackStrategy: FallbackStrategy;
  /** Description for debugging/logging */
  description?: string;
}

/**
 * Result of model routing decision
 */
export interface RoutingDecision {
  /** Selected provider */
  provider: LLMProviderType;
  /** Selected model */
  model: string;
  /** Model capabilities */
  capabilities: ModelCapabilities;
  /** Estimated cost per 1K tokens (input + output average) */
  estimatedCostPer1K: number;
  /** Reasoning effort to use (if applicable) */
  reasoningEffort?: 'none' | 'low' | 'medium' | 'high' | 'xhigh';
  /** How this decision was made */
  reason: string;
  /** Fallback options if this fails */
  fallbacks: Array<{ provider: LLMProviderType; model: string }>;
}

/**
 * Budget mode settings
 */
export type BudgetMode = 'normal' | 'economy' | 'strict';

/**
 * Routing options for a specific request
 */
export interface RoutingOptions {
  /** Task type for routing */
  taskType: AgentTaskType;
  /** Estimated input tokens (for cost calculation) */
  estimatedInputTokens?: number;
  /** Estimated output tokens (for cost calculation) */
  estimatedOutputTokens?: number;
  /** Maximum cost for this request */
  maxCost?: number;
  /** Budget mode to use */
  budgetMode?: BudgetMode;
  /** Force a specific provider (overrides routing) */
  forceProvider?: LLMProviderType;
  /** Force a specific model (overrides routing) */
  forceModel?: string;
  /** Whether to include local models in consideration */
  allowLocalModels?: boolean;
  /** Whether to include cloud models in consideration */
  allowCloudModels?: boolean;
}

/**
 * Router configuration
 */
export interface RouterConfig {
  /** Default budget mode */
  defaultBudgetMode: BudgetMode;
  /** Whether to prefer local models when available */
  preferLocalModels: boolean;
  /** Default fallback strategy */
  defaultFallbackStrategy: FallbackStrategy;
  /** Enable automatic failover between providers */
  enableFailover: boolean;
  /** Custom routing rules (override defaults) */
  customRules?: RoutingRule[];
}
