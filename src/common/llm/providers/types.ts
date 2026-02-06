/**
 * LLM Provider Abstraction Types
 *
 * These types define the contract for LLM providers, enabling
 * multi-provider support with unified interfaces.
 */

/**
 * Supported LLM provider identifiers
 */
export type LLMProviderType = 'openai' | 'anthropic' | 'ollama';

/**
 * Task types that influence model selection
 */
export enum AgentTaskType {
  ATOMIZATION = 'atomization',
  REFINEMENT = 'refinement',
  TRANSLATION = 'translation',
  ANALYSIS = 'analysis',
  CHAT = 'chat',
  CODE_GENERATION = 'code_generation',
  SUMMARIZATION = 'summarization',
  CLASSIFICATION = 'classification',
}

/**
 * Message role types (normalized across providers)
 */
export type MessageRole = 'system' | 'user' | 'assistant' | 'tool';

/**
 * Tool/function definition for function calling
 */
export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<
      string,
      {
        type: string;
        description?: string;
        enum?: string[];
      }
    >;
    required?: string[];
  };
}

/**
 * Tool call from LLM response
 */
export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

/**
 * Normalized message format for provider requests
 */
export interface ProviderMessage {
  role: MessageRole;
  content: string;
  /** Tool calls made by assistant (for assistant messages) */
  toolCalls?: ToolCall[];
  /** Tool call ID (for tool messages) */
  toolCallId?: string;
}

/**
 * Provider-specific request options
 */
export interface ProviderRequestOptions {
  /** Temperature for response randomness (0-1) */
  temperature?: number;
  /** Maximum tokens in response */
  maxTokens?: number;
  /** Request timeout in milliseconds */
  timeout?: number;
  /** Stop sequences to end generation */
  stopSequences?: string[];
  /** GPT-5.2 specific: reasoning effort level */
  reasoningEffort?: 'none' | 'low' | 'medium' | 'high' | 'xhigh';
  /** GPT-5.2 specific: verbosity control */
  verbosity?: 'concise' | 'balanced' | 'detailed';
  /** Arbitrary provider-specific options */
  providerOptions?: Record<string, unknown>;
}

/**
 * Normalized request format for all providers
 */
export interface ProviderRequest {
  /** Messages to send to the LLM */
  messages: ProviderMessage[];
  /** Model to use (optional, uses provider default if not specified) */
  model?: string;
  /** Request options */
  options?: ProviderRequestOptions;
  /** Tools/functions available for the LLM to call */
  tools?: ToolDefinition[];
  /** Metadata for tracing/logging */
  metadata?: {
    requestId?: string;
    agentName?: string;
    purpose?: string;
    taskType?: AgentTaskType;
  };
}

/**
 * Token usage information from provider response
 */
export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

/**
 * Normalized response format from all providers
 */
export interface ProviderResponse {
  /** Generated content */
  content: string;
  /** Token usage statistics */
  usage: TokenUsage;
  /** Model that was actually used */
  modelUsed: string;
  /** Provider that handled the request */
  providerUsed: LLMProviderType;
  /** Response latency in milliseconds */
  latencyMs: number;
  /** Raw provider response (for debugging/advanced usage) */
  rawResponse?: unknown;
  /** Finish reason from provider */
  finishReason?: 'stop' | 'length' | 'content_filter' | 'tool_calls' | string;
  /** Tool calls made by the LLM (if any) */
  toolCalls?: ToolCall[];
}

/**
 * Model capabilities description
 */
export interface ModelCapabilities {
  /** Maximum context window in tokens */
  contextWindow: number;
  /** Supports image/vision input */
  supportsVision: boolean;
  /** Supports function/tool calling */
  supportsFunctionCalling: boolean;
  /** Supports streaming responses */
  supportsStreaming: boolean;
  /** Supports reasoning effort parameter (GPT-5.2 specific) */
  supportsReasoningEffort?: boolean;
  /** Cost per input token in dollars */
  costPerInputToken: number;
  /** Cost per output token in dollars */
  costPerOutputToken: number;
  /** Maximum output tokens */
  maxOutputTokens?: number;
  /** Model description for UI display */
  description?: string;
}

/**
 * Provider health status
 */
export interface ProviderHealthStatus {
  /** Provider is operational */
  available: boolean;
  /** Last successful request timestamp */
  lastSuccessAt?: Date;
  /** Last error message if any */
  lastError?: string;
  /** Error timestamp */
  lastErrorAt?: Date;
  /** Response latency in ms (rolling average) */
  averageLatencyMs?: number;
}

/**
 * LLM Provider Interface
 *
 * All LLM providers must implement this interface to be usable
 * by the LLM service.
 */
export interface LLMProvider {
  /**
   * Unique name identifier for this provider
   */
  readonly name: LLMProviderType;

  /**
   * Human-readable display name
   */
  readonly displayName: string;

  /**
   * List of models supported by this provider
   */
  readonly supportedModels: string[];

  /**
   * Default model to use if none specified
   */
  readonly defaultModel: string;

  /**
   * Invoke the LLM with a request
   *
   * @param request - Normalized request
   * @returns Normalized response
   * @throws Error if invocation fails
   */
  invoke(request: ProviderRequest): Promise<ProviderResponse>;

  /**
   * Estimate token count for text
   *
   * @param text - Text to count tokens for
   * @param model - Model to use for tokenization (optional)
   * @returns Estimated token count
   */
  getTokenCount(text: string, model?: string): number;

  /**
   * Check if the provider is currently available
   *
   * @returns True if provider is available
   */
  isAvailable(): Promise<boolean>;

  /**
   * Get capabilities for a specific model
   *
   * @param model - Model name
   * @returns Model capabilities or undefined if model not supported
   */
  getModelCapabilities(model: string): ModelCapabilities | undefined;

  /**
   * Get current health status of the provider
   *
   * @returns Health status information
   */
  getHealthStatus(): ProviderHealthStatus;

  /**
   * Initialize the provider (called once on startup)
   *
   * @returns Promise that resolves when initialization is complete
   */
  initialize?(): Promise<void>;

  /**
   * Cleanup resources (called on shutdown)
   *
   * @returns Promise that resolves when cleanup is complete
   */
  shutdown?(): Promise<void>;
}

/**
 * Provider configuration for initialization
 */
export interface ProviderConfig {
  /** API key for authentication */
  apiKey?: string;
  /** Custom endpoint URL (for Ollama or Azure) */
  endpoint?: string;
  /** Default timeout in milliseconds */
  timeout?: number;
  /** Default temperature */
  defaultTemperature?: number;
  /** Default max tokens */
  defaultMaxTokens?: number;
  /** Provider-specific configuration */
  options?: Record<string, unknown>;
}

/**
 * Model routing recommendation
 */
export interface ModelRecommendation {
  /** Recommended provider */
  provider: LLMProviderType;
  /** Recommended model */
  model: string;
  /** Confidence score (0-1) */
  confidence: number;
  /** Reason for recommendation */
  reason: string;
  /** Estimated cost per request (rough estimate) */
  estimatedCost?: number;
}
