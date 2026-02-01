/**
 * LLM Service Configuration
 *
 * This configuration starts as a file-based setup for development.
 * In production, these values can be overridden by database settings
 * from the llm_configurations table, allowing for UI-based management.
 */

export interface LLMModelConfig {
  provider: 'openai' | 'anthropic' | 'ollama' | 'azure-openai';
  modelName: string;
  apiKey?: string;
  endpoint?: string; // For Azure, Ollama, or custom endpoints
  temperature: number;
  maxTokens?: number;
  costPerInputToken: number; // In dollars
  costPerOutputToken: number; // In dollars
}

export interface CircuitBreakerConfig {
  enabled: boolean;
  failureThreshold: number; // Number of failures before opening circuit
  successThreshold: number; // Number of successes to close circuit
  timeout: number; // Time in ms before attempting to close circuit
  monitoringWindow: number; // Time window in ms to track failures
}

export interface RetryConfig {
  enabled: boolean;
  maxRetries: number;
  initialDelay: number; // In ms
  maxDelay: number; // In ms
  backoffMultiplier: number; // Exponential backoff multiplier
  retryableStatusCodes: number[]; // HTTP status codes to retry
  retryableErrors: string[]; // Error types to retry
}

export interface RateLimitConfig {
  enabled: boolean;
  requestsPerMinute: number;
  burstSize: number; // Max requests in burst
  queueEnabled: boolean; // Enable request queuing when rate limited
  maxQueueSize: number;
}

export interface CacheConfig {
  enabled: boolean;
  ttl: number; // Time to live in seconds
  keyPrefix: string;
  excludePatterns?: string[]; // Regex patterns for requests to not cache
}

export interface BudgetConfig {
  enabled: boolean;
  dailyLimit: number; // In dollars
  monthlyLimit: number; // In dollars
  alertThreshold: number; // Percentage (0-100) at which to alert
  hardStop: boolean; // Stop requests when budget exceeded
}

export interface ObservabilityConfig {
  metricsEnabled: boolean;
  detailedLogging: boolean;
  tracingEnabled: boolean;
  logLevel: 'error' | 'warn' | 'info' | 'debug';
}

export interface LLMServiceConfig {
  // Model Configuration
  primaryModel: LLMModelConfig;
  fallbackModels: LLMModelConfig[];

  // Request Configuration
  defaultTimeout: number; // In ms
  streamingEnabled: boolean;

  // Resilience Patterns
  circuitBreaker: CircuitBreakerConfig;
  retry: RetryConfig;
  rateLimit: RateLimitConfig;

  // Optimization
  cache: CacheConfig;
  budget: BudgetConfig;

  // Observability
  observability: ObservabilityConfig;
}

/**
 * Default LLM Service Configuration for Development
 *
 * IMPORTANT: This is a starting point. In production:
 * 1. API keys should come from environment variables
 * 2. Configuration should be loaded from database (llm_configurations table)
 * 3. Users should be able to modify settings via UI
 */
export const defaultLLMConfig: LLMServiceConfig = {
  primaryModel: {
    provider: 'openai',
    modelName: 'gpt-5-nano', // Most cost-effective for testing
    temperature: 0.2,
    maxTokens: 4096,
    costPerInputToken: 0.00000005, // $0.05 per 1M input tokens
    costPerOutputToken: 0.0000004, // $0.40 per 1M output tokens
  },
  fallbackModels: [
    {
      provider: 'openai',
      modelName: 'gpt-5-mini', // Balanced fallback
      temperature: 0.2,
      maxTokens: 4096,
      costPerInputToken: 0.0000004, // $0.40 per 1M input tokens
      costPerOutputToken: 0.0000016, // $1.60 per 1M output tokens
    },
  ],
  // Circuit breaker uses this timeout - must accommodate longest expected request (synthesize: 90s)
  // Individual requests can specify shorter timeouts via the request options
  defaultTimeout: 120000, // 120 seconds - allows synthesize to complete
  streamingEnabled: false,

  circuitBreaker: {
    enabled: true,
    failureThreshold: 5, // Open circuit after 5 failures
    successThreshold: 2, // Close circuit after 2 successes
    timeout: 60000, // Try to close circuit after 60 seconds
    monitoringWindow: 120000, // Track failures over 2 minutes
  },

  retry: {
    enabled: true,
    maxRetries: 3,
    initialDelay: 1000, // Start with 1 second
    maxDelay: 10000, // Cap at 10 seconds
    backoffMultiplier: 2, // Double the delay each retry
    retryableStatusCodes: [429, 500, 502, 503, 504],
    retryableErrors: [
      'ECONNRESET',
      'ETIMEDOUT',
      'ENOTFOUND',
      'ECONNREFUSED',
      'rate_limit_exceeded',
    ],
  },

  rateLimit: {
    enabled: true,
    requestsPerMinute: 60,
    burstSize: 10,
    queueEnabled: true,
    maxQueueSize: 100,
  },

  cache: {
    enabled: true,
    ttl: 3600, // 1 hour
    keyPrefix: 'llm:cache:',
    excludePatterns: [],
  },

  budget: {
    enabled: true,
    dailyLimit: 10, // $10 per day
    monthlyLimit: 200, // $200 per month
    alertThreshold: 80, // Alert at 80% of budget
    hardStop: true, // Stop requests when budget exceeded
  },

  observability: {
    metricsEnabled: true,
    detailedLogging: true,
    tracingEnabled: true,
    logLevel: 'info',
  },
};

/**
 * Load LLM configuration from environment and config
 * In the future, this will merge with database settings
 */
export function loadLLMConfig(): LLMServiceConfig {
  const config = { ...defaultLLMConfig };

  // Override with environment variables if present
  if (process.env.OPENAI_API_KEY) {
    config.primaryModel.apiKey = process.env.OPENAI_API_KEY;
  }

  if (process.env.OPENAI_MODEL) {
    config.primaryModel.modelName = process.env.OPENAI_MODEL;
  }

  // Support selecting default provider via environment
  const defaultProvider = process.env.LLM_DEFAULT_PROVIDER as
    | LLMModelConfig['provider']
    | undefined;
  if (
    defaultProvider &&
    ['openai', 'anthropic', 'ollama', 'azure-openai'].includes(defaultProvider)
  ) {
    config.primaryModel.provider = defaultProvider;

    // Update model and API key based on provider
    switch (defaultProvider) {
      case 'anthropic':
        config.primaryModel.modelName = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5';
        config.primaryModel.apiKey = process.env.ANTHROPIC_API_KEY;
        config.primaryModel.costPerInputToken = 0.000003; // $3 per 1M
        config.primaryModel.costPerOutputToken = 0.000015; // $15 per 1M
        break;
      case 'ollama':
        config.primaryModel.modelName = process.env.OLLAMA_MODEL || 'llama3.2:latest';
        config.primaryModel.endpoint = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
        config.primaryModel.costPerInputToken = 0; // Free - local
        config.primaryModel.costPerOutputToken = 0;
        break;
    }
  }

  if (process.env.LLM_DAILY_BUDGET) {
    config.budget.dailyLimit = Number.parseFloat(process.env.LLM_DAILY_BUDGET);
  }

  if (process.env.LLM_MONTHLY_BUDGET) {
    config.budget.monthlyLimit = Number.parseFloat(process.env.LLM_MONTHLY_BUDGET);
  }

  // Allow disabling features via environment (useful for tests)
  if (process.env.LLM_CACHE_ENABLED === 'false') {
    config.cache.enabled = false;
  }

  if (process.env.LLM_CIRCUIT_BREAKER_ENABLED === 'false') {
    config.circuitBreaker.enabled = false;
  }

  if (process.env.LLM_RATE_LIMIT_ENABLED === 'false') {
    config.rateLimit.enabled = false;
  }

  return config;
}
