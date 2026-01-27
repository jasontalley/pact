/**
 * Anthropic LLM Provider
 *
 * Implements the LLMProvider interface for Anthropic Claude models including
 * Claude 4.5 family (claude-sonnet-4-5, claude-opus-4-5, claude-haiku-4-5).
 *
 * Note: Per Anthropic's model selection guide, Sonnet 4.5 is recommended for
 * "complex agents and coding" over Opus for most use cases.
 */

import { ChatAnthropic } from '@langchain/anthropic';
import { BaseMessage, HumanMessage, SystemMessage, AIMessage } from '@langchain/core/messages';
import { LangChainTracer } from '@langchain/core/tracers/tracer_langchain';

import { BaseLLMProvider } from './base.provider';
import {
  LLMProviderType,
  ProviderConfig,
  ProviderRequest,
  ProviderResponse,
  ModelCapabilities,
} from './types';

/**
 * Anthropic-specific configuration options
 */
export interface AnthropicProviderConfig extends ProviderConfig {
  /** Enable LangSmith tracing */
  enableTracing?: boolean;
  /** LangSmith project name */
  tracingProject?: string;
}

/**
 * Claude model capabilities
 *
 * Model IDs use the dated format (e.g., claude-sonnet-4-5-20250514)
 * but we also support short aliases (e.g., claude-sonnet-4-5).
 */
const CLAUDE_MODEL_CAPABILITIES: Record<string, ModelCapabilities> = {
  // Claude 4.5 family
  'claude-sonnet-4-5-20250514': {
    contextWindow: 200000,
    supportsVision: true,
    supportsFunctionCalling: true,
    supportsStreaming: true,
    supportsReasoningEffort: false,
    costPerInputToken: 0.000003, // $3 per 1M
    costPerOutputToken: 0.000015, // $15 per 1M
    maxOutputTokens: 8192,
    description: 'Best for complex agents and coding tasks (recommended)',
  },
  'claude-opus-4-5-20250514': {
    contextWindow: 200000,
    supportsVision: true,
    supportsFunctionCalling: true,
    supportsStreaming: true,
    supportsReasoningEffort: false,
    costPerInputToken: 0.000015, // $15 per 1M
    costPerOutputToken: 0.000075, // $75 per 1M
    maxOutputTokens: 8192,
    description: 'Most capable Claude model for demanding tasks',
  },
  'claude-haiku-4-5-20250514': {
    contextWindow: 200000,
    supportsVision: true,
    supportsFunctionCalling: true,
    supportsStreaming: true,
    supportsReasoningEffort: false,
    costPerInputToken: 0.000001, // $1 per 1M
    costPerOutputToken: 0.000005, // $5 per 1M
    maxOutputTokens: 8192,
    description: 'Fast and cost-effective for simpler tasks',
  },
  // Aliases for convenience (map to dated versions)
  'claude-sonnet-4-5': {
    contextWindow: 200000,
    supportsVision: true,
    supportsFunctionCalling: true,
    supportsStreaming: true,
    supportsReasoningEffort: false,
    costPerInputToken: 0.000003,
    costPerOutputToken: 0.000015,
    maxOutputTokens: 8192,
    description: 'Best for complex agents and coding tasks (recommended)',
  },
  'claude-opus-4-5': {
    contextWindow: 200000,
    supportsVision: true,
    supportsFunctionCalling: true,
    supportsStreaming: true,
    supportsReasoningEffort: false,
    costPerInputToken: 0.000015,
    costPerOutputToken: 0.000075,
    maxOutputTokens: 8192,
    description: 'Most capable Claude model for demanding tasks',
  },
  'claude-haiku-4-5': {
    contextWindow: 200000,
    supportsVision: true,
    supportsFunctionCalling: true,
    supportsStreaming: true,
    supportsReasoningEffort: false,
    costPerInputToken: 0.000001,
    costPerOutputToken: 0.000005,
    maxOutputTokens: 8192,
    description: 'Fast and cost-effective for simpler tasks',
  },
  // Legacy models (for compatibility)
  'claude-3-sonnet-20240229': {
    contextWindow: 200000,
    supportsVision: true,
    supportsFunctionCalling: true,
    supportsStreaming: true,
    supportsReasoningEffort: false,
    costPerInputToken: 0.000003,
    costPerOutputToken: 0.000015,
    maxOutputTokens: 4096,
    description: 'Legacy Claude 3 Sonnet',
  },
  'claude-3-haiku-20240307': {
    contextWindow: 200000,
    supportsVision: true,
    supportsFunctionCalling: true,
    supportsStreaming: true,
    supportsReasoningEffort: false,
    costPerInputToken: 0.00000025,
    costPerOutputToken: 0.00000125,
    maxOutputTokens: 4096,
    description: 'Legacy Claude 3 Haiku',
  },
};

/**
 * Map short aliases to dated model IDs
 */
const MODEL_ALIASES: Record<string, string> = {
  'claude-sonnet-4-5': 'claude-sonnet-4-5-20250514',
  'claude-opus-4-5': 'claude-opus-4-5-20250514',
  'claude-haiku-4-5': 'claude-haiku-4-5-20250514',
};

/**
 * Anthropic Provider Implementation
 */
export class AnthropicProvider extends BaseLLMProvider {
  readonly name: LLMProviderType = 'anthropic';
  readonly displayName = 'Anthropic';
  readonly supportedModels = Object.keys(CLAUDE_MODEL_CAPABILITIES);
  readonly defaultModel = 'claude-sonnet-4-5'; // Recommended by Anthropic for agents

  private tracer: LangChainTracer | null = null;
  private readonly anthropicConfig: AnthropicProviderConfig;

  constructor(config: AnthropicProviderConfig = {}) {
    super(config);
    this.anthropicConfig = config;
  }

  /**
   * Initialize the Anthropic provider
   */
  async initialize(): Promise<void> {
    this.logger.log('Initializing Anthropic provider...');

    const apiKey = this.anthropicConfig.apiKey || process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      this.logger.warn('No Anthropic API key configured');
      this.healthStatus.available = false;
      return;
    }

    // Initialize tracer if enabled
    if (this.anthropicConfig.enableTracing || process.env.LANGCHAIN_TRACING_V2 === 'true') {
      const langchainApiKey = process.env.LANGCHAIN_API_KEY;
      if (langchainApiKey) {
        this.tracer = new LangChainTracer({
          projectName:
            this.anthropicConfig.tracingProject || process.env.LANGCHAIN_PROJECT || 'pact-agents',
        });
        this.logger.log('LangSmith tracer initialized for Anthropic provider');
      }
    }

    await super.initialize();
  }

  /**
   * Check if Anthropic API is available
   */
  protected async checkAvailability(): Promise<boolean> {
    const apiKey = this.anthropicConfig.apiKey || process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return false;
    }

    try {
      // Create a minimal test client
      const testClient = new ChatAnthropic({
        modelName: this.resolveModelName(this.defaultModel),
        anthropicApiKey: apiKey,
        maxTokens: 5,
      });

      // Make a minimal test call
      await testClient.invoke([new HumanMessage('Hi')]);
      return true;
    } catch (error) {
      this.logger.warn(`Anthropic availability check failed: ${error.message}`);
      return false;
    }
  }

  /**
   * Resolve model aliases to actual model names
   */
  private resolveModelName(model: string): string {
    return MODEL_ALIASES[model] || model;
  }

  /**
   * Invoke Anthropic Claude model
   */
  protected async doInvoke(request: ProviderRequest): Promise<ProviderResponse> {
    const requestedModel = this.getModel(request);
    const model = this.resolveModelName(requestedModel);

    // Validate the resolved model
    if (!this.supportedModels.includes(requestedModel) && !this.supportedModels.includes(model)) {
      throw new Error(
        `Model '${requestedModel}' is not supported by ${this.displayName}. ` +
          `Supported models: ${this.supportedModels.join(', ')}`,
      );
    }

    const apiKey = this.anthropicConfig.apiKey || process.env.ANTHROPIC_API_KEY;

    if (!apiKey) {
      throw new Error('Anthropic API key not configured');
    }

    // Build model options
    const modelOptions: Record<string, unknown> = {
      modelName: model,
      anthropicApiKey: apiKey,
      maxTokens: request.options?.maxTokens || this.config.defaultMaxTokens || 4096,
    };

    // Add temperature if specified
    if (request.options?.temperature !== undefined) {
      modelOptions.temperature = request.options.temperature;
    } else if (this.config.defaultTemperature !== undefined) {
      modelOptions.temperature = this.config.defaultTemperature;
    }

    // Add stop sequences if specified
    if (request.options?.stopSequences) {
      modelOptions.stopSequences = request.options.stopSequences;
    }

    // Create client for this request
    const client = new ChatAnthropic(modelOptions);

    // Convert messages to LangChain format
    // Note: Anthropic requires system messages to be separate
    const systemMessages: string[] = [];
    const chatMessages: BaseMessage[] = [];

    for (const msg of request.messages) {
      switch (msg.role) {
        case 'system':
          // Collect system messages to combine
          systemMessages.push(msg.content);
          break;
        case 'assistant':
          chatMessages.push(new AIMessage(msg.content));
          break;
        case 'user':
        default:
          chatMessages.push(new HumanMessage(msg.content));
          break;
      }
    }

    // If we have system messages, add them as a SystemMessage
    if (systemMessages.length > 0) {
      chatMessages.unshift(new SystemMessage(systemMessages.join('\n\n')));
    }

    // Build callbacks array
    const callbacks = this.tracer ? [this.tracer] : [];

    // Invoke the model
    const response = await client.invoke(chatMessages, {
      callbacks,
      runName: request.metadata?.agentName || 'anthropic-call',
      metadata: {
        requestId: request.metadata?.requestId,
        agentName: request.metadata?.agentName,
        purpose: request.metadata?.purpose,
        taskType: request.metadata?.taskType,
      },
      tags: [request.metadata?.agentName || 'pact', 'anthropic', model],
    });

    // Wait for tracer handlers
    if (this.tracer) {
      try {
        await Promise.all(callbacks.map((cb) => (cb as any).awaitHandlers?.()));
      } catch {
        // Ignore tracer errors
      }
    }

    // Extract token usage from response metadata
    const inputTokens = (response as any).response_metadata?.usage?.input_tokens || 0;
    const outputTokens = (response as any).response_metadata?.usage?.output_tokens || 0;
    const stopReason = (response as any).response_metadata?.stop_reason;

    return {
      content: response.content as string,
      usage: {
        inputTokens,
        outputTokens,
        totalTokens: inputTokens + outputTokens,
      },
      modelUsed: model,
      providerUsed: 'anthropic',
      latencyMs: 0, // Will be set by base class
      finishReason: stopReason,
      rawResponse: response,
    };
  }

  /**
   * Get capabilities for a model
   */
  getModelCapabilities(model: string): ModelCapabilities | undefined {
    // Check both direct model name and alias
    return (
      CLAUDE_MODEL_CAPABILITIES[model] || CLAUDE_MODEL_CAPABILITIES[this.resolveModelName(model)]
    );
  }

  /**
   * Estimate token count for text
   *
   * Claude uses a similar tokenization to GPT models.
   * Uses a simple approximation (4 chars per token on average).
   */
  getTokenCount(text: string, _model?: string): number {
    // Rough approximation: ~4 characters per token
    return Math.ceil(text.length / 4);
  }

  /**
   * Shutdown the provider
   */
  async shutdown(): Promise<void> {
    this.logger.log('Shutting down Anthropic provider...');
    this.tracer = null;
  }
}
