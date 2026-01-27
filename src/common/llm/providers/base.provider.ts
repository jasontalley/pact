/**
 * Base LLM Provider
 *
 * Abstract base class providing common functionality for all LLM providers.
 */

import { Logger } from '@nestjs/common';
import {
  LLMProvider,
  LLMProviderType,
  ProviderConfig,
  ProviderHealthStatus,
  ProviderRequest,
  ProviderResponse,
  ModelCapabilities,
} from './types';

/**
 * Abstract base class for LLM providers
 *
 * Provides common functionality like health tracking, logging,
 * and response timing. Concrete providers extend this class.
 */
export abstract class BaseLLMProvider implements LLMProvider {
  protected readonly logger: Logger;
  protected config: ProviderConfig;
  protected healthStatus: ProviderHealthStatus = {
    available: false,
    averageLatencyMs: 0,
  };

  // Rolling average window for latency tracking
  private latencyHistory: number[] = [];
  private readonly maxLatencyHistory = 100;

  abstract readonly name: LLMProviderType;
  abstract readonly displayName: string;
  abstract readonly supportedModels: string[];
  abstract readonly defaultModel: string;

  constructor(config: ProviderConfig = {}) {
    this.config = config;
    this.logger = new Logger(this.constructor.name);
  }

  /**
   * Abstract method to be implemented by concrete providers
   */
  protected abstract doInvoke(request: ProviderRequest): Promise<ProviderResponse>;

  /**
   * Abstract method to check provider availability
   */
  protected abstract checkAvailability(): Promise<boolean>;

  /**
   * Abstract method to get model capabilities
   */
  abstract getModelCapabilities(model: string): ModelCapabilities | undefined;

  /**
   * Abstract method to count tokens
   */
  abstract getTokenCount(text: string, model?: string): number;

  /**
   * Invoke the LLM with request timing and health tracking
   */
  async invoke(request: ProviderRequest): Promise<ProviderResponse> {
    const startTime = Date.now();

    try {
      const response = await this.doInvoke(request);

      // Update health status on success
      const latencyMs = Date.now() - startTime;
      response.latencyMs = latencyMs;
      this.recordSuccess(latencyMs);

      return response;
    } catch (error) {
      // Update health status on failure
      this.recordFailure(error.message);
      throw error;
    }
  }

  /**
   * Check if provider is available
   */
  async isAvailable(): Promise<boolean> {
    try {
      const available = await this.checkAvailability();
      this.healthStatus.available = available;
      return available;
    } catch (error) {
      this.healthStatus.available = false;
      this.healthStatus.lastError = error.message;
      this.healthStatus.lastErrorAt = new Date();
      return false;
    }
  }

  /**
   * Get current health status
   */
  getHealthStatus(): ProviderHealthStatus {
    return { ...this.healthStatus };
  }

  /**
   * Record successful request
   */
  protected recordSuccess(latencyMs: number): void {
    this.healthStatus.available = true;
    this.healthStatus.lastSuccessAt = new Date();
    this.healthStatus.lastError = undefined;
    this.healthStatus.lastErrorAt = undefined;

    // Update rolling latency average
    this.latencyHistory.push(latencyMs);
    if (this.latencyHistory.length > this.maxLatencyHistory) {
      this.latencyHistory.shift();
    }
    this.healthStatus.averageLatencyMs =
      this.latencyHistory.reduce((a, b) => a + b, 0) / this.latencyHistory.length;
  }

  /**
   * Record failed request
   */
  protected recordFailure(errorMessage: string): void {
    this.healthStatus.lastError = errorMessage;
    this.healthStatus.lastErrorAt = new Date();
    // Don't set available to false on single failure - let circuit breaker handle that
  }

  /**
   * Get default model or specified model
   */
  protected getModel(request: ProviderRequest): string {
    return request.model || this.defaultModel;
  }

  /**
   * Validate that model is supported
   */
  protected validateModel(model: string): void {
    if (!this.supportedModels.includes(model)) {
      throw new Error(
        `Model '${model}' is not supported by ${this.displayName}. ` +
          `Supported models: ${this.supportedModels.join(', ')}`,
      );
    }
  }

  /**
   * Optional initialization hook
   */
  async initialize(): Promise<void> {
    this.logger.log(`Initializing ${this.displayName} provider...`);
    const available = await this.isAvailable();
    this.logger.log(`${this.displayName} provider ${available ? 'ready' : 'unavailable'}`);
  }

  /**
   * Optional shutdown hook
   */
  async shutdown(): Promise<void> {
    this.logger.log(`Shutting down ${this.displayName} provider...`);
  }
}
