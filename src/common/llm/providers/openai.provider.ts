/**
 * OpenAI LLM Provider
 *
 * Implements the LLMProvider interface for OpenAI models including
 * GPT-5 family (gpt-5.2, gpt-5.2-pro, gpt-5.2-codex, gpt-5-mini, gpt-5-nano).
 */

import { ChatOpenAI } from '@langchain/openai';
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
 * OpenAI-specific configuration options
 */
export interface OpenAIProviderConfig extends ProviderConfig {
  /** Organization ID for OpenAI API */
  organization?: string;
  /** Enable LangSmith tracing */
  enableTracing?: boolean;
  /** LangSmith project name */
  tracingProject?: string;
}

/**
 * GPT-5 model capabilities
 */
const GPT5_MODEL_CAPABILITIES: Record<string, ModelCapabilities> = {
  'gpt-5.2': {
    contextWindow: 256000,
    supportsVision: true,
    supportsFunctionCalling: true,
    supportsStreaming: true,
    supportsReasoningEffort: true,
    costPerInputToken: 0.0000025, // $2.50 per 1M
    costPerOutputToken: 0.00001, // $10 per 1M
    maxOutputTokens: 64000,
    description: 'Most capable GPT-5 model with full reasoning support',
  },
  'gpt-5.2-pro': {
    contextWindow: 256000,
    supportsVision: true,
    supportsFunctionCalling: true,
    supportsStreaming: true,
    supportsReasoningEffort: true,
    costPerInputToken: 0.000005, // $5 per 1M
    costPerOutputToken: 0.00002, // $20 per 1M
    maxOutputTokens: 64000,
    description: 'Enhanced GPT-5.2 with advanced reasoning for complex tasks',
  },
  'gpt-5.2-codex': {
    contextWindow: 256000,
    supportsVision: false,
    supportsFunctionCalling: true,
    supportsStreaming: true,
    supportsReasoningEffort: true,
    costPerInputToken: 0.000003, // $3 per 1M
    costPerOutputToken: 0.000012, // $12 per 1M
    maxOutputTokens: 64000,
    description: 'Specialized for code generation and analysis',
  },
  'gpt-5-mini': {
    contextWindow: 128000,
    supportsVision: true,
    supportsFunctionCalling: true,
    supportsStreaming: true,
    supportsReasoningEffort: false,
    costPerInputToken: 0.0000004, // $0.40 per 1M
    costPerOutputToken: 0.0000016, // $1.60 per 1M
    maxOutputTokens: 16384,
    description: 'Balanced cost/performance for general tasks',
  },
  'gpt-5-nano': {
    contextWindow: 128000,
    supportsVision: false,
    supportsFunctionCalling: true,
    supportsStreaming: true,
    supportsReasoningEffort: false,
    costPerInputToken: 0.00000005, // $0.05 per 1M
    costPerOutputToken: 0.0000004, // $0.40 per 1M
    maxOutputTokens: 16384,
    description: 'Most cost-effective for simple tasks and high volume',
  },
  // Legacy models (kept for compatibility)
  'gpt-4-turbo-preview': {
    contextWindow: 128000,
    supportsVision: true,
    supportsFunctionCalling: true,
    supportsStreaming: true,
    supportsReasoningEffort: false,
    costPerInputToken: 0.00001, // $10 per 1M
    costPerOutputToken: 0.00003, // $30 per 1M
    maxOutputTokens: 4096,
    description: 'Legacy GPT-4 Turbo model',
  },
  'gpt-4o': {
    contextWindow: 128000,
    supportsVision: true,
    supportsFunctionCalling: true,
    supportsStreaming: true,
    supportsReasoningEffort: false,
    costPerInputToken: 0.000005, // $5 per 1M
    costPerOutputToken: 0.000015, // $15 per 1M
    maxOutputTokens: 4096,
    description: 'Legacy GPT-4o omni model',
  },
};

/**
 * OpenAI Provider Implementation
 */
export class OpenAIProvider extends BaseLLMProvider {
  readonly name: LLMProviderType = 'openai';
  readonly displayName = 'OpenAI';
  readonly supportedModels = Object.keys(GPT5_MODEL_CAPABILITIES);
  readonly defaultModel = 'gpt-5-nano';

  private client: ChatOpenAI | null = null;
  private tracer: LangChainTracer | null = null;
  private readonly openaiConfig: OpenAIProviderConfig;

  constructor(config: OpenAIProviderConfig = {}) {
    super(config);
    this.openaiConfig = config;
  }

  /**
   * Initialize the OpenAI provider
   */
  async initialize(): Promise<void> {
    this.logger.log('Initializing OpenAI provider...');

    const apiKey = this.openaiConfig.apiKey || process.env.OPENAI_API_KEY;
    if (!apiKey) {
      this.logger.warn('No OpenAI API key configured');
      this.healthStatus.available = false;
      return;
    }

    // Initialize tracer if enabled
    if (this.openaiConfig.enableTracing || process.env.LANGCHAIN_TRACING_V2 === 'true') {
      const langchainApiKey = process.env.LANGCHAIN_API_KEY;
      if (langchainApiKey) {
        this.tracer = new LangChainTracer({
          projectName:
            this.openaiConfig.tracingProject || process.env.LANGCHAIN_PROJECT || 'pact-agents',
        });
        this.logger.log('LangSmith tracer initialized for OpenAI provider');
      }
    }

    await super.initialize();
  }

  /**
   * Check if OpenAI API is available
   */
  protected async checkAvailability(): Promise<boolean> {
    const apiKey = this.openaiConfig.apiKey || process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return false;
    }

    try {
      // Create a minimal test client
      const testClient = new ChatOpenAI({
        modelName: this.defaultModel,
        openAIApiKey: apiKey,
        maxTokens: 5,
      });

      // Make a minimal test call
      await testClient.invoke([new HumanMessage('Hi')]);
      return true;
    } catch (error) {
      this.logger.warn(`OpenAI availability check failed: ${error.message}`);
      return false;
    }
  }

  /**
   * Invoke OpenAI model
   */
  protected async doInvoke(request: ProviderRequest): Promise<ProviderResponse> {
    const model = this.getModel(request);
    this.validateModel(model);

    const capabilities = this.getModelCapabilities(model);
    const apiKey = this.openaiConfig.apiKey || process.env.OPENAI_API_KEY;

    if (!apiKey) {
      throw new Error('OpenAI API key not configured');
    }

    // Determine if model has restrictions (gpt-5-nano has limited options)
    const isNanoModel = model === 'gpt-5-nano';
    const supportsReasoningEffort = capabilities?.supportsReasoningEffort || false;

    // Build model options
    const modelOptions: Record<string, unknown> = {
      modelName: model,
      openAIApiKey: apiKey,
      timeout: request.options?.timeout || this.config.timeout || 30000,
    };

    // Add temperature and maxTokens only if model supports them
    if (!isNanoModel) {
      if (request.options?.temperature !== undefined) {
        modelOptions.temperature = request.options.temperature;
      } else if (this.config.defaultTemperature !== undefined) {
        modelOptions.temperature = this.config.defaultTemperature;
      }

      if (request.options?.maxTokens !== undefined) {
        modelOptions.maxTokens = request.options.maxTokens;
      } else if (this.config.defaultMaxTokens !== undefined) {
        modelOptions.maxTokens = this.config.defaultMaxTokens;
      }
    }

    // Add GPT-5.2 specific options via model kwargs
    if (supportsReasoningEffort && request.options?.reasoningEffort) {
      modelOptions.modelKwargs = {
        ...((modelOptions.modelKwargs as Record<string, unknown>) || {}),
        reasoning: { effort: request.options.reasoningEffort },
      };
    }

    if (request.options?.verbosity && !isNanoModel) {
      modelOptions.modelKwargs = {
        ...((modelOptions.modelKwargs as Record<string, unknown>) || {}),
        verbosity: request.options.verbosity,
      };
    }

    // Create client for this request
    const client = new ChatOpenAI(modelOptions);

    // Convert messages to LangChain format
    const messages: BaseMessage[] = request.messages.map((msg) => {
      switch (msg.role) {
        case 'system':
          return new SystemMessage(msg.content);
        case 'assistant':
          return new AIMessage(msg.content);
        case 'user':
        default:
          return new HumanMessage(msg.content);
      }
    });

    // Build callbacks array
    const callbacks = this.tracer ? [this.tracer] : [];

    // Invoke the model
    const response = await client.invoke(messages, {
      callbacks,
      runName: request.metadata?.agentName || 'openai-call',
      metadata: {
        requestId: request.metadata?.requestId,
        agentName: request.metadata?.agentName,
        purpose: request.metadata?.purpose,
        taskType: request.metadata?.taskType,
      },
      tags: [request.metadata?.agentName || 'pact', 'openai', model],
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
    const inputTokens = (response as any).response_metadata?.tokenUsage?.promptTokens || 0;
    const outputTokens = (response as any).response_metadata?.tokenUsage?.completionTokens || 0;
    const finishReason = (response as any).response_metadata?.finish_reason;

    return {
      content: response.content as string,
      usage: {
        inputTokens,
        outputTokens,
        totalTokens: inputTokens + outputTokens,
      },
      modelUsed: model,
      providerUsed: 'openai',
      latencyMs: 0, // Will be set by base class
      finishReason,
      rawResponse: response,
    };
  }

  /**
   * Get capabilities for a model
   */
  getModelCapabilities(model: string): ModelCapabilities | undefined {
    return GPT5_MODEL_CAPABILITIES[model];
  }

  /**
   * Estimate token count for text
   *
   * Uses a simple approximation (4 chars per token on average).
   * For precise counting, use tiktoken library.
   */
  getTokenCount(text: string, _model?: string): number {
    // Rough approximation: ~4 characters per token for English text
    // This is a simplification; for accuracy, use tiktoken
    return Math.ceil(text.length / 4);
  }

  /**
   * Shutdown the provider
   */
  async shutdown(): Promise<void> {
    this.logger.log('Shutting down OpenAI provider...');
    this.client = null;
    this.tracer = null;
  }
}
