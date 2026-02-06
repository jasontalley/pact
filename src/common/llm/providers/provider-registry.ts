/**
 * LLM Provider Registry
 *
 * Central registry for managing LLM providers. Handles:
 * - Provider registration and initialization
 * - Provider health tracking
 * - Provider selection based on availability
 */

import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import {
  LLMProvider,
  LLMProviderType,
  ProviderConfig,
  ProviderHealthStatus,
  ModelCapabilities,
} from './types';
import { OpenAIProvider, OpenAIProviderConfig } from './openai.provider';
import { AnthropicProvider, AnthropicProviderConfig } from './anthropic.provider';
import { OllamaProvider, OllamaProviderConfig } from './ollama.provider';

/**
 * Registry configuration
 */
export interface ProviderRegistryConfig {
  /** OpenAI provider configuration */
  openai?: OpenAIProviderConfig;
  /** Anthropic provider configuration */
  anthropic?: AnthropicProviderConfig;
  /** Ollama provider configuration */
  ollama?: OllamaProviderConfig;
  /** Preferred provider order for fallback */
  preferredOrder?: LLMProviderType[];
  /** Enable automatic failover between providers */
  enableFailover?: boolean;
  /** Health check interval in milliseconds (0 to disable) */
  healthCheckInterval?: number;
}

/**
 * Provider status for monitoring
 */
export interface ProviderStatus {
  name: LLMProviderType;
  displayName: string;
  available: boolean;
  health: ProviderHealthStatus;
  supportedModels: string[];
  defaultModel: string;
}

/**
 * Provider Registry - manages all LLM providers
 */
@Injectable()
export class ProviderRegistry implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ProviderRegistry.name);
  private providers: Map<LLMProviderType, LLMProvider> = new Map();
  private config: ProviderRegistryConfig;
  private healthCheckTimer: NodeJS.Timeout | null = null;
  private initialized = false;

  constructor(private readonly configService: ConfigService) {
    this.config = this.loadConfig();
  }

  /**
   * Load configuration from environment and defaults
   */
  private loadConfig(): ProviderRegistryConfig {
    return {
      openai: {
        apiKey: this.configService.get<string>('OPENAI_API_KEY'),
        enableTracing: this.configService.get<string>('LANGCHAIN_TRACING_V2') === 'true',
        defaultTemperature: 0.2,
      },
      anthropic: {
        apiKey: this.configService.get<string>('ANTHROPIC_API_KEY'),
        enableTracing: this.configService.get<string>('LANGCHAIN_TRACING_V2') === 'true',
        defaultTemperature: 0.2,
      },
      ollama: {
        baseUrl: this.configService.get<string>('OLLAMA_BASE_URL') || 'http://localhost:11434',
        enableTracing: this.configService.get<string>('LANGCHAIN_TRACING_V2') === 'true',
        defaultTemperature: 0.2,
      },
      preferredOrder: ['ollama', 'openai', 'anthropic'], // Local first, then cloud
      enableFailover: true,
      healthCheckInterval: 60000, // Check every minute
    };
  }

  /**
   * Initialize the registry and all providers
   */
  async onModuleInit(): Promise<void> {
    this.logger.log('Initializing Provider Registry...');

    // Create and register providers
    await this.registerProviders();

    // Start health monitoring
    if (this.config.healthCheckInterval && this.config.healthCheckInterval > 0) {
      this.startHealthMonitoring();
    }

    this.initialized = true;
    this.logger.log('Provider Registry initialized');
  }

  /**
   * Cleanup on shutdown
   */
  async onModuleDestroy(): Promise<void> {
    this.logger.log('Shutting down Provider Registry...');

    // Stop health monitoring
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }

    // Shutdown all providers
    for (const provider of this.providers.values()) {
      try {
        await provider.shutdown?.();
      } catch (error) {
        this.logger.error(`Error shutting down ${provider.name}: ${error.message}`);
      }
    }

    this.providers.clear();
    this.initialized = false;
  }

  /**
   * Register all configured providers
   */
  private async registerProviders(): Promise<void> {
    // Register OpenAI if configured
    if (this.config.openai?.apiKey) {
      try {
        const openai = new OpenAIProvider(this.config.openai);
        await openai.initialize();
        this.providers.set('openai', openai);
        this.logger.log('OpenAI provider registered');
      } catch (error) {
        this.logger.warn(`Failed to initialize OpenAI provider: ${error.message}`);
      }
    } else {
      this.logger.warn('OpenAI provider not configured (no API key)');
    }

    // Register Anthropic if configured
    if (this.config.anthropic?.apiKey) {
      try {
        const anthropic = new AnthropicProvider(this.config.anthropic);
        await anthropic.initialize();
        this.providers.set('anthropic', anthropic);
        this.logger.log('Anthropic provider registered');
      } catch (error) {
        this.logger.warn(`Failed to initialize Anthropic provider: ${error.message}`);
      }
    } else {
      this.logger.warn('Anthropic provider not configured (no API key)');
    }

    // Register Ollama (always attempt, it's local)
    try {
      const ollama = new OllamaProvider(this.config.ollama);
      await ollama.initialize();
      const isAvailable = await ollama.isAvailable();
      if (isAvailable) {
        this.providers.set('ollama', ollama);
        this.logger.log('Ollama provider registered');
      } else {
        this.logger.warn('Ollama provider not available (server not running or no models)');
      }
    } catch (error) {
      this.logger.warn(`Failed to initialize Ollama provider: ${error.message}`);
    }

    this.logger.log(`Registered ${this.providers.size} provider(s)`);
  }

  /**
   * Start periodic health monitoring
   */
  private startHealthMonitoring(): void {
    this.healthCheckTimer = setInterval(async () => {
      await this.checkAllProviderHealth();
    }, this.config.healthCheckInterval!);

    this.logger.log(`Health monitoring started (interval: ${this.config.healthCheckInterval}ms)`);
  }

  /**
   * Check health of all providers
   */
  private async checkAllProviderHealth(): Promise<void> {
    for (const [name, provider] of this.providers) {
      try {
        await provider.isAvailable();
      } catch (error) {
        this.logger.warn(`Health check failed for ${name}: ${error.message}`);
      }
    }
  }

  /**
   * Get a specific provider by name
   */
  getProvider(name: LLMProviderType): LLMProvider | undefined {
    return this.providers.get(name);
  }

  /**
   * Get all registered providers
   */
  getAllProviders(): LLMProvider[] {
    return Array.from(this.providers.values());
  }

  /**
   * Get provider names
   */
  getProviderNames(): LLMProviderType[] {
    return Array.from(this.providers.keys());
  }

  /**
   * Check if a provider is registered and available
   */
  async isProviderAvailable(name: LLMProviderType): Promise<boolean> {
    const provider = this.providers.get(name);
    if (!provider) return false;
    return provider.isAvailable();
  }

  /**
   * Get the best available provider based on preference order
   */
  async getBestAvailableProvider(): Promise<LLMProvider | undefined> {
    const order = this.config.preferredOrder || ['openai', 'anthropic', 'ollama'];

    for (const providerName of order) {
      const provider = this.providers.get(providerName);
      if (provider && (await provider.isAvailable())) {
        return provider;
      }
    }

    return undefined;
  }

  /**
   * Get a provider that supports a specific model
   */
  getProviderForModel(model: string): LLMProvider | undefined {
    for (const provider of this.providers.values()) {
      if (provider.supportedModels.includes(model)) {
        return provider;
      }
    }
    return undefined;
  }

  /**
   * Get model capabilities across all providers
   */
  getModelCapabilities(model: string): ModelCapabilities | undefined {
    const provider = this.getProviderForModel(model);
    if (provider) {
      return provider.getModelCapabilities(model);
    }
    return undefined;
  }

  /**
   * Get all available models across all providers
   */
  getAllAvailableModels(): Array<{
    model: string;
    provider: LLMProviderType;
    capabilities: ModelCapabilities;
  }> {
    const models: Array<{
      model: string;
      provider: LLMProviderType;
      capabilities: ModelCapabilities;
    }> = [];

    for (const provider of this.providers.values()) {
      for (const model of provider.supportedModels) {
        const capabilities = provider.getModelCapabilities(model);
        if (capabilities) {
          models.push({
            model,
            provider: provider.name,
            capabilities,
          });
        }
      }
    }

    return models;
  }

  /**
   * Get status of all providers
   */
  getProviderStatuses(): ProviderStatus[] {
    const statuses: ProviderStatus[] = [];

    for (const provider of this.providers.values()) {
      statuses.push({
        name: provider.name,
        displayName: provider.displayName,
        available: provider.getHealthStatus().available,
        health: provider.getHealthStatus(),
        supportedModels: provider.supportedModels,
        defaultModel: provider.defaultModel,
      });
    }

    return statuses;
  }

  /**
   * Manually register a provider
   */
  async registerProvider(provider: LLMProvider): Promise<void> {
    await provider.initialize?.();
    this.providers.set(provider.name, provider);
    this.logger.log(`Manually registered provider: ${provider.name}`);
  }

  /**
   * Unregister a provider
   */
  async unregisterProvider(name: LLMProviderType): Promise<void> {
    const provider = this.providers.get(name);
    if (provider) {
      await provider.shutdown?.();
      this.providers.delete(name);
      this.logger.log(`Unregistered provider: ${name}`);
    }
  }

  /**
   * Check if the registry is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Get count of available providers
   */
  getAvailableProviderCount(): number {
    return this.providers.size;
  }
}
