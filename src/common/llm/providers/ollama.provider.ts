/**
 * Ollama LLM Provider
 *
 * Implements the LLMProvider interface for locally-hosted Ollama models.
 * Supports models like llama3.2, qwen2.5-coder, codellama, etc.
 *
 * Cost: Free (local inference)
 * Latency: Depends on hardware
 */

import { ChatOllama } from '@langchain/ollama';
import {
  BaseMessage,
  HumanMessage,
  SystemMessage,
  AIMessage,
  ToolMessage,
} from '@langchain/core/messages';
import { LangChainTracer } from '@langchain/core/tracers/tracer_langchain';
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
 * Ollama-specific configuration options
 */
export interface OllamaProviderConfig extends ProviderConfig {
  /** Ollama server base URL (default: http://localhost:11434) */
  baseUrl?: string;
  /** Enable LangSmith tracing */
  enableTracing?: boolean;
  /** LangSmith project name */
  tracingProject?: string;
  /** Number of GPU layers to use (-1 for all) */
  numGpu?: number;
  /** Number of CPU threads */
  numThread?: number;
}

/**
 * Common Ollama model capabilities
 *
 * Note: Ollama models are free but context windows and capabilities
 * vary by model. These are common configurations.
 */
const OLLAMA_MODEL_CAPABILITIES: Record<string, ModelCapabilities> = {
  // Llama 3.2 family (Meta)
  'llama3.2': {
    contextWindow: 128000,
    supportsVision: false,
    supportsFunctionCalling: true,
    supportsStreaming: true,
    supportsReasoningEffort: false,
    costPerInputToken: 0, // Free - local
    costPerOutputToken: 0,
    maxOutputTokens: 4096,
    description: 'Llama 3.2 (latest) - balanced performance',
  },
  'llama3.2:latest': {
    contextWindow: 128000,
    supportsVision: false,
    supportsFunctionCalling: true,
    supportsStreaming: true,
    supportsReasoningEffort: false,
    costPerInputToken: 0,
    costPerOutputToken: 0,
    maxOutputTokens: 4096,
    description: 'Llama 3.2 latest tag',
  },
  'llama3.2:3b': {
    contextWindow: 128000,
    supportsVision: false,
    supportsFunctionCalling: true,
    supportsStreaming: true,
    supportsReasoningEffort: false,
    costPerInputToken: 0,
    costPerOutputToken: 0,
    maxOutputTokens: 4096,
    description: 'Llama 3.2 3B - fast, lightweight',
  },
  'llama3.2:1b': {
    contextWindow: 128000,
    supportsVision: false,
    supportsFunctionCalling: true,
    supportsStreaming: true,
    supportsReasoningEffort: false,
    costPerInputToken: 0,
    costPerOutputToken: 0,
    maxOutputTokens: 4096,
    description: 'Llama 3.2 1B - fastest, most lightweight',
  },
  'llama3.3': {
    contextWindow: 128000,
    supportsVision: false,
    supportsFunctionCalling: true,
    supportsStreaming: true,
    supportsReasoningEffort: false,
    costPerInputToken: 0,
    costPerOutputToken: 0,
    maxOutputTokens: 4096,
    description: 'Llama 3.3 - improved reasoning',
  },
  // Code-specialized models
  'qwen2.5-coder': {
    contextWindow: 32768,
    supportsVision: false,
    supportsFunctionCalling: true,
    supportsStreaming: true,
    supportsReasoningEffort: false,
    costPerInputToken: 0,
    costPerOutputToken: 0,
    maxOutputTokens: 4096,
    description: 'Qwen 2.5 Coder - specialized for code generation',
  },
  'qwen2.5-coder:7b': {
    contextWindow: 32768,
    supportsVision: false,
    supportsFunctionCalling: true,
    supportsStreaming: true,
    supportsReasoningEffort: false,
    costPerInputToken: 0,
    costPerOutputToken: 0,
    maxOutputTokens: 4096,
    description: 'Qwen 2.5 Coder 7B parameter model',
  },
  codellama: {
    contextWindow: 16384,
    supportsVision: false,
    supportsFunctionCalling: false,
    supportsStreaming: true,
    supportsReasoningEffort: false,
    costPerInputToken: 0,
    costPerOutputToken: 0,
    maxOutputTokens: 4096,
    description: 'CodeLlama - Meta code generation model',
  },
  'codellama:13b': {
    contextWindow: 16384,
    supportsVision: false,
    supportsFunctionCalling: false,
    supportsStreaming: true,
    supportsReasoningEffort: false,
    costPerInputToken: 0,
    costPerOutputToken: 0,
    maxOutputTokens: 4096,
    description: 'CodeLlama 13B parameter model',
  },
  // DeepSeek Coder
  'deepseek-coder': {
    contextWindow: 16384,
    supportsVision: false,
    supportsFunctionCalling: true,
    supportsStreaming: true,
    supportsReasoningEffort: false,
    costPerInputToken: 0,
    costPerOutputToken: 0,
    maxOutputTokens: 4096,
    description: 'DeepSeek Coder - strong code generation',
  },
  // Mistral family
  mistral: {
    contextWindow: 32768,
    supportsVision: false,
    supportsFunctionCalling: true,
    supportsStreaming: true,
    supportsReasoningEffort: false,
    costPerInputToken: 0,
    costPerOutputToken: 0,
    maxOutputTokens: 4096,
    description: 'Mistral 7B - efficient general purpose',
  },
  'mistral:7b': {
    contextWindow: 32768,
    supportsVision: false,
    supportsFunctionCalling: true,
    supportsStreaming: true,
    supportsReasoningEffort: false,
    costPerInputToken: 0,
    costPerOutputToken: 0,
    maxOutputTokens: 4096,
    description: 'Mistral 7B parameter model',
  },
  mixtral: {
    contextWindow: 32768,
    supportsVision: false,
    supportsFunctionCalling: true,
    supportsStreaming: true,
    supportsReasoningEffort: false,
    costPerInputToken: 0,
    costPerOutputToken: 0,
    maxOutputTokens: 4096,
    description: 'Mixtral 8x7B MoE - powerful mixture of experts',
  },
};

/**
 * Ollama Provider Implementation
 */
export class OllamaProvider extends BaseLLMProvider {
  readonly name: LLMProviderType = 'ollama';
  readonly displayName = 'Ollama (Local)';
  readonly defaultModel = 'llama3.2:latest';

  // Supported models can be extended at runtime based on what's installed
  private _supportedModels: string[] = Object.keys(OLLAMA_MODEL_CAPABILITIES);
  private _installedModels: string[] = [];

  private tracer: LangChainTracer | null = null;
  private readonly ollamaConfig: OllamaProviderConfig;
  private baseUrl: string;

  constructor(config: OllamaProviderConfig = {}) {
    super(config);
    this.ollamaConfig = config;
    this.baseUrl = config.baseUrl || process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
  }

  get supportedModels(): string[] {
    // Return both known models and any discovered installed models
    const allModels = new Set([...this._supportedModels, ...this._installedModels]);
    return Array.from(allModels);
  }

  /**
   * Initialize the Ollama provider
   */
  async initialize(): Promise<void> {
    this.logger.log('Initializing Ollama provider...');
    this.logger.log(`Ollama base URL: ${this.baseUrl}`);

    // Initialize tracer if enabled
    if (this.ollamaConfig.enableTracing || process.env.LANGCHAIN_TRACING_V2 === 'true') {
      const langchainApiKey = process.env.LANGCHAIN_API_KEY;
      if (langchainApiKey) {
        this.tracer = new LangChainTracer({
          projectName:
            this.ollamaConfig.tracingProject || process.env.LANGCHAIN_PROJECT || 'pact-agents',
        });
        this.logger.log('LangSmith tracer initialized for Ollama provider');
      }
    }

    // Discover installed models
    await this.discoverInstalledModels();

    await super.initialize();
  }

  /**
   * Discover models installed in Ollama
   */
  private async discoverInstalledModels(): Promise<void> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`);
      if (response.ok) {
        const data = await response.json();
        this._installedModels = (data.models || []).map((m: any) => m.name);
        this.logger.log(`Discovered ${this._installedModels.length} installed Ollama models`);
        if (this._installedModels.length > 0) {
          this.logger.debug(`Installed models: ${this._installedModels.join(', ')}`);
        }
      }
    } catch (error) {
      this.logger.warn(`Could not discover Ollama models: ${error.message}`);
    }
  }

  /**
   * Check if Ollama is available
   */
  protected async checkAvailability(): Promise<boolean> {
    try {
      // Check if Ollama server is responding
      const response = await fetch(`${this.baseUrl}/api/tags`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) {
        return false;
      }

      // Verify the default model is available
      const data = await response.json();
      const models = (data.models || []).map((m: any) => m.name);

      // Update installed models
      this._installedModels = models;

      if (models.length === 0) {
        this.logger.warn('Ollama is running but no models are installed');
        return false;
      }

      return true;
    } catch (error) {
      this.logger.warn(`Ollama availability check failed: ${error.message}`);
      return false;
    }
  }

  /**
   * Invoke Ollama model
   */
  protected async doInvoke(request: ProviderRequest): Promise<ProviderResponse> {
    const model = this.getModel(request);

    // Build model options
    const modelOptions: Record<string, unknown> = {
      model,
      baseUrl: this.baseUrl,
    };

    // Add temperature if specified
    if (request.options?.temperature !== undefined) {
      modelOptions.temperature = request.options.temperature;
    } else if (this.config.defaultTemperature !== undefined) {
      modelOptions.temperature = this.config.defaultTemperature;
    }

    // Add GPU/CPU options if specified
    if (this.ollamaConfig.numGpu !== undefined) {
      modelOptions.numGpu = this.ollamaConfig.numGpu;
    }
    if (this.ollamaConfig.numThread !== undefined) {
      modelOptions.numThread = this.ollamaConfig.numThread;
    }

    // Create client for this request
    const client = new ChatOllama(modelOptions);

    // Convert tools to LangChain format and bind to client
    // Note: Tool support in Ollama depends on the model - llama3.2, qwen2.5-coder, mistral support tools
    let boundClient = client;
    if (request.tools && request.tools.length > 0) {
      const capabilities = this.getModelCapabilities(model);
      if (capabilities?.supportsFunctionCalling) {
        const langchainTools = this.convertToolsToLangChain(request.tools);
        boundClient = client.bindTools(langchainTools) as ChatOllama;
      } else {
        this.logger.warn(`Model ${model} does not support function calling, tools will be ignored`);
      }
    }

    // Convert messages to LangChain format
    const messages: BaseMessage[] = request.messages.map((msg) => {
      switch (msg.role) {
        case 'system':
          return new SystemMessage(msg.content);
        case 'assistant': {
          // Construct AIMessage with tool_calls in constructor if present
          if (msg.toolCalls && msg.toolCalls.length > 0) {
            return new AIMessage({
              content: msg.content || '',
              tool_calls: msg.toolCalls.map((tc) => ({
                id: tc.id,
                name: tc.name,
                args: tc.arguments,
                type: 'tool_call' as const,
              })),
            });
          }
          return new AIMessage(msg.content);
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
      runName: request.metadata?.agentName || 'ollama-call',
      metadata: {
        requestId: request.metadata?.requestId,
        agentName: request.metadata?.agentName,
        purpose: request.metadata?.purpose,
        taskType: request.metadata?.taskType,
      },
      tags: [request.metadata?.agentName || 'pact', 'ollama', model],
    });

    // Wait for tracer handlers
    if (this.tracer) {
      try {
        await Promise.all(callbacks.map((cb) => (cb as any).awaitHandlers?.()));
      } catch {
        // Ignore tracer errors
      }
    }

    // Extract text content - handle both string and array content formats
    // Some models may return content as array of content blocks when tool_use is involved
    let outputText: string;
    if (typeof response.content === 'string') {
      outputText = response.content;
    } else if (Array.isArray(response.content)) {
      // Extract text from content blocks
      outputText = response.content
        .filter((block: any) => block.type === 'text')
        .map((block: any) => block.text)
        .join('');
    } else {
      outputText = '';
    }

    // Ollama doesn't provide detailed token counts in the same way
    // We estimate based on content length
    const inputText = request.messages.map((m) => m.content).join(' ');
    const inputTokens = this.getTokenCount(inputText);
    const outputTokens = this.getTokenCount(outputText);

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

    return {
      content: outputText,
      usage: {
        inputTokens,
        outputTokens,
        totalTokens: inputTokens + outputTokens,
      },
      modelUsed: model,
      providerUsed: 'ollama',
      latencyMs: 0, // Will be set by base class
      finishReason: 'stop',
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

      const langchainTool = new DynamicStructuredTool({
        name: tool.name,
        description: tool.description,
        schema: schema as any, // Type assertion to avoid deep type instantiation error
        func: async () => {
          // This is a placeholder - actual execution happens in chat-agent service
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
    // Check for exact match first
    if (OLLAMA_MODEL_CAPABILITIES[model]) {
      return OLLAMA_MODEL_CAPABILITIES[model];
    }

    // Check for base model name (e.g., "llama3.2:latest" -> "llama3.2")
    const baseName = model.split(':')[0];
    if (OLLAMA_MODEL_CAPABILITIES[baseName]) {
      return OLLAMA_MODEL_CAPABILITIES[baseName];
    }

    // Return default capabilities for unknown models
    // This allows using models not in our predefined list
    if (this._installedModels.includes(model)) {
      return {
        contextWindow: 4096,
        supportsVision: false,
        supportsFunctionCalling: false,
        supportsStreaming: true,
        supportsReasoningEffort: false,
        costPerInputToken: 0,
        costPerOutputToken: 0,
        maxOutputTokens: 2048,
        description: `Ollama model: ${model}`,
      };
    }

    return undefined;
  }

  /**
   * Estimate token count for text
   *
   * Uses a simple approximation. Ollama models vary in tokenization
   * but ~4 chars per token is a reasonable estimate.
   */
  getTokenCount(text: string, _model?: string): number {
    return Math.ceil(text.length / 4);
  }

  /**
   * Shutdown the provider
   */
  async shutdown(): Promise<void> {
    this.logger.log('Shutting down Ollama provider...');
    this.tracer = null;
  }

  /**
   * Pull a model from Ollama registry
   */
  async pullModel(modelName: string): Promise<boolean> {
    try {
      this.logger.log(`Pulling model ${modelName}...`);
      const response = await fetch(`${this.baseUrl}/api/pull`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: modelName }),
      });

      if (response.ok) {
        // Refresh installed models
        await this.discoverInstalledModels();
        return true;
      }
      return false;
    } catch (error) {
      this.logger.error(`Failed to pull model ${modelName}: ${error.message}`);
      return false;
    }
  }

  /**
   * Get list of installed models
   */
  getInstalledModels(): string[] {
    return [...this._installedModels];
  }
}
