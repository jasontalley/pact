/**
 * OpenAI LLM Provider
 *
 * Implements the LLMProvider interface for OpenAI models including
 * GPT-5 family (gpt-5.2, gpt-5.2-pro, gpt-5.2-codex, gpt-5-mini, gpt-5-nano).
 */

import { ChatOpenAI } from '@langchain/openai';
import {
  BaseMessage,
  HumanMessage,
  SystemMessage,
  AIMessage,
  ToolMessage,
} from '@langchain/core/messages';
import { LangChainTracer } from '@langchain/core/tracers/tracer_langchain';
import { StructuredTool } from '@langchain/core/tools';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';

import { BaseLLMProvider } from './base.provider';
import {
  LLMProviderType,
  ProviderConfig,
  ProviderRequest,
  ProviderResponse,
  ModelCapabilities,
  ToolDefinition,
  ToolCall,
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
    supportsReasoningEffort: false,
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
    supportsReasoningEffort: false,
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
   *
   * Uses the lightweight /v1/models endpoint instead of making an actual
   * LLM call to avoid consuming tokens and reduce latency.
   */
  protected async checkAvailability(): Promise<boolean> {
    const apiKey = this.openaiConfig.apiKey || process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return false;
    }

    try {
      // Use the /v1/models endpoint - no tokens consumed, fast response
      const response = await fetch('https://api.openai.com/v1/models', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) {
        this.logger.warn(`OpenAI availability check failed: HTTP ${response.status}`);
        return false;
      }

      // Verify we can parse the response and it has models
      const data = await response.json();
      return Array.isArray(data.data) && data.data.length > 0;
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

    // Determine if this is a GPT-5 model (requires max_completion_tokens instead of max_tokens)
    const isGPT5Model = model.startsWith('gpt-5');
    const isNanoModel = model === 'gpt-5-nano';
    const supportsReasoningEffort = capabilities?.supportsReasoningEffort || false;

    // Build model options
    const modelOptions: Record<string, unknown> = {
      modelName: model,
      openAIApiKey: apiKey,
      timeout: request.options?.timeout || this.config.timeout || 30000,
    };

    // GPT-5 models require max_completion_tokens instead of max_tokens
    // and nano model has limited temperature support
    if (isGPT5Model) {
      // GPT-5 models use max_completion_tokens via modelKwargs
      const maxTokens = request.options?.maxTokens || this.config.defaultMaxTokens || 4096;
      modelOptions.modelKwargs = {
        ...((modelOptions.modelKwargs as Record<string, unknown>) || {}),
        max_completion_tokens: maxTokens,
      };

      // Only add temperature for non-nano models
      if (!isNanoModel) {
        if (request.options?.temperature !== undefined) {
          modelOptions.temperature = request.options.temperature;
        } else if (this.config.defaultTemperature !== undefined) {
          modelOptions.temperature = this.config.defaultTemperature;
        }
      }
    } else {
      // Legacy models use standard maxTokens parameter
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

    // Convert tools to LangChain format and bind to client
    let boundClient = client;
    if (request.tools && request.tools.length > 0) {
      const langchainTools = this.convertToolsToLangChain(request.tools);
      boundClient = client.bindTools(langchainTools) as ChatOpenAI;
    }

    // Convert messages to LangChain format
    const messages: BaseMessage[] = request.messages.map((msg) => {
      switch (msg.role) {
        case 'system':
          return new SystemMessage(msg.content);
        case 'assistant': {
          const aiMsg = new AIMessage(msg.content);
          // Add tool calls if present
          if (msg.toolCalls && msg.toolCalls.length > 0) {
            (aiMsg as any).tool_calls = msg.toolCalls.map((tc) => ({
              id: tc.id,
              name: tc.name,
              args: tc.arguments,
            }));
          }
          return aiMsg;
        }
        case 'tool':
          return new ToolMessage({
            content: msg.content,
            tool_call_id: msg.toolCallId || '',
          });
        case 'user':
        default:
          return new HumanMessage(msg.content);
      }
    });

    // Build callbacks array
    const callbacks = this.tracer ? [this.tracer] : [];

    // Invoke the model
    const response = await boundClient.invoke(messages, {
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

    // Extract tool calls from response
    const toolCalls: ToolCall[] = [];
    if ((response as any).tool_calls) {
      for (const tc of (response as any).tool_calls) {
        toolCalls.push({
          id: tc.id,
          name: tc.name,
          arguments: tc.args || {},
        });
      }
    }

    // Extract text content - handle both string and array content formats
    // OpenAI can return content as array of content blocks when tool_use is involved
    let textContent: string;
    if (typeof response.content === 'string') {
      textContent = response.content;
    } else if (Array.isArray(response.content)) {
      // Extract text from content blocks
      textContent = response.content
        .filter((block: any) => block.type === 'text')
        .map((block: any) => block.text)
        .join('');
    } else {
      textContent = '';
    }

    return {
      content: textContent,
      usage: {
        inputTokens,
        outputTokens,
        totalTokens: inputTokens + outputTokens,
      },
      modelUsed: model,
      providerUsed: 'openai',
      latencyMs: 0, // Will be set by base class
      finishReason,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      rawResponse: response,
    };
  }

  /**
   * Convert ToolDefinition to LangChain StructuredTool
   */
  private convertToolsToLangChain(tools: ToolDefinition[]): any[] {
    const result: any[] = [];

    for (const tool of tools) {
      // Convert parameters to Zod schema
      const zodSchema: Record<string, z.ZodTypeAny> = {};
      for (const [key, param] of Object.entries(tool.parameters.properties)) {
        switch (param.type) {
          case 'string':
            zodSchema[key] = param.enum
              ? z.enum(param.enum as [string, ...string[]])
              : z.string().describe(param.description || '');
            break;
          case 'number':
            zodSchema[key] = z.number().describe(param.description || '');
            break;
          case 'boolean':
            zodSchema[key] = z.boolean().describe(param.description || '');
            break;
          case 'array':
            zodSchema[key] = z.array(z.any()).describe(param.description || '');
            break;
          case 'object':
            zodSchema[key] = z.record(z.any()).describe(param.description || '');
            break;
          default:
            zodSchema[key] = z.any().describe(param.description || '');
        }
      }

      const schema = z.object(zodSchema);

      // @ts-expect-error - Type instantiation is too deep, but this works at runtime
      const langchainTool = new DynamicStructuredTool({
        name: tool.name,
        description: tool.description,
        schema,
        func: async () => {
          // This is a placeholder - actual execution happens in chat-agent.service
          throw new Error('Tool execution should be handled by chat-agent service');
        },
      });

      result.push(langchainTool);
    }

    return result;
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
