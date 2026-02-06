/**
 * LLM Types
 *
 * TypeScript types for LLM provider, model, and usage data.
 */

/**
 * Supported LLM provider identifiers
 */
export type LLMProviderType = 'openai' | 'anthropic' | 'ollama';

/**
 * Task types for routing
 */
export type AgentTaskType =
  | 'atomization'
  | 'refinement'
  | 'translation'
  | 'analysis'
  | 'chat'
  | 'code_generation'
  | 'summarization'
  | 'classification';

/**
 * Budget mode for cost optimization
 */
export type BudgetMode = 'normal' | 'economy' | 'strict';

/**
 * Provider health status
 */
export interface ProviderHealth {
  available: boolean;
  lastSuccessAt?: string;
  lastError?: string;
  lastErrorAt?: string;
  averageLatencyMs?: number;
}

/**
 * Provider status information
 */
export interface ProviderStatus {
  name: LLMProviderType;
  displayName: string;
  available: boolean;
  health: ProviderHealth;
  supportedModels: string[];
  defaultModel: string;
}

/**
 * Provider list response
 */
export interface ProviderListResponse {
  providers: ProviderStatus[];
  availableCount: number;
  totalCount: number;
}

/**
 * Model capabilities
 */
export interface ModelCapabilities {
  contextWindow: number;
  supportsVision: boolean;
  supportsFunctionCalling: boolean;
  supportsStreaming: boolean;
  supportsReasoningEffort?: boolean;
  costPerInputToken: number;
  costPerOutputToken: number;
  maxOutputTokens?: number;
  description?: string;
}

/**
 * Model information
 */
export interface ModelInfo {
  model: string;
  provider: LLMProviderType;
  capabilities: ModelCapabilities;
  costPer1K: string;
  isLocal: boolean;
}

/**
 * Model list response
 */
export interface ModelListResponse {
  models: ModelInfo[];
  totalCount: number;
  filter?: {
    provider?: LLMProviderType;
    supportsVision?: boolean;
    supportsFunctionCalling?: boolean;
  };
}

/**
 * Model query parameters
 */
export interface ModelQuery {
  provider?: LLMProviderType;
  supportsVision?: boolean;
  supportsFunctionCalling?: boolean;
}

/**
 * Provider usage statistics
 */
export interface ProviderUsage {
  provider: LLMProviderType;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  totalCost: number;
  averageLatencyMs: number;
  cacheHitRate: number;
}

/**
 * Model usage statistics
 */
export interface ModelUsage {
  model: string;
  provider: LLMProviderType;
  totalRequests: number;
  totalTokens: number;
  totalCost: number;
}

/**
 * Agent usage statistics
 */
export interface AgentUsage {
  agentName: string;
  totalRequests: number;
  totalTokens: number;
  totalCost: number;
  averageLatencyMs: number;
}

/**
 * Budget status
 */
export interface BudgetStatus {
  dailyCost: number;
  dailyLimit: number;
  dailyUtilization: number;
  monthlyCost: number;
  monthlyLimit: number;
  monthlyUtilization: number;
  hardStopEnabled: boolean;
}

/**
 * Usage summary response
 */
export interface UsageSummary {
  period: {
    start: string;
    end: string;
    type: 'day' | 'week' | 'month' | 'custom';
  };
  totals: {
    requests: number;
    successfulRequests: number;
    failedRequests: number;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    totalCost: number;
    averageLatencyMs: number;
    cacheHitRate: number;
  };
  byProvider: ProviderUsage[];
  byModel: ModelUsage[];
  byAgent: AgentUsage[];
  budget: BudgetStatus;
}

/**
 * Usage query parameters
 */
export interface UsageQuery {
  period?: 'day' | 'week' | 'month';
  startDate?: string;
  endDate?: string;
}

/**
 * Model recommendation
 */
export interface ModelRecommendation {
  provider: LLMProviderType;
  model: string;
  estimatedCost: number;
  formattedCost: string;
  reason: string;
  isPrimary: boolean;
}

/**
 * Cost estimate request
 */
export interface CostEstimateRequest {
  taskType: AgentTaskType;
  inputTokens: number;
  outputTokens: number;
  budgetMode?: BudgetMode;
  forceProvider?: LLMProviderType;
  forceModel?: string;
}

/**
 * Cost estimate response
 */
export interface CostEstimateResponse {
  taskType: AgentTaskType;
  budgetMode: BudgetMode;
  inputTokens: number;
  outputTokens: number;
  minCost: number;
  maxCost: number;
  formattedMinCost: string;
  formattedMaxCost: string;
  recommendedModel: string;
  recommendations: ModelRecommendation[];
  localModelsAvailable: boolean;
}

/**
 * Provider configuration
 */
export interface ProviderConfig {
  provider: LLMProviderType;
  enabled: boolean;
  apiKey?: string;
  apiKeySet: boolean;
  endpoint?: string;
  defaultModel: string;
  priority: number;
}

/**
 * Model preference for a task type
 */
export interface ModelPreference {
  taskType: AgentTaskType;
  preferredProvider: LLMProviderType;
  preferredModel: string;
  fallbackProvider?: LLMProviderType;
  fallbackModel?: string;
}

/**
 * Budget configuration
 */
export interface BudgetConfig {
  dailyLimitUsd: number;
  monthlyLimitUsd: number;
  hardStopEnabled: boolean;
  warningThresholdPercent: number;
  alertEmail?: string;
}

/**
 * LLM configuration
 */
export interface LLMConfig {
  providers: ProviderConfig[];
  modelPreferences: ModelPreference[];
  budget: BudgetConfig;
  defaultBudgetMode: BudgetMode;
  preferLocalModels: boolean;
  cacheEnabled: boolean;
  cacheTtlSeconds: number;
}

/**
 * Provider test result
 */
export interface ProviderTestResult {
  provider: LLMProviderType;
  success: boolean;
  latencyMs?: number;
  error?: string;
  modelTested?: string;
}

/**
 * Update provider config request
 */
export interface UpdateProviderConfigRequest {
  provider: LLMProviderType;
  enabled?: boolean;
  apiKey?: string;
  endpoint?: string;
  defaultModel?: string;
  priority?: number;
}

/**
 * Update budget config request
 */
export interface UpdateBudgetConfigRequest {
  dailyLimitUsd?: number;
  monthlyLimitUsd?: number;
  hardStopEnabled?: boolean;
  warningThresholdPercent?: number;
  alertEmail?: string;
}

/**
 * Usage data point for charts
 */
export interface UsageDataPoint {
  date: string;
  cost: number;
  tokens: number;
  requests: number;
}

/**
 * Usage trend data
 */
export interface UsageTrendData {
  daily: UsageDataPoint[];
  weekly: UsageDataPoint[];
  monthly: UsageDataPoint[];
}
