/**
 * LLM Service - Multi-Provider Abstraction Layer
 *
 * Production-ready LLM service with:
 * - Multi-provider support (OpenAI, Anthropic, Ollama)
 * - Intelligent model routing based on task type
 * - Circuit breakers, retries, rate limiting
 * - Cost tracking and budget enforcement
 * - Response caching
 */

import { Injectable, Logger, OnModuleInit, OnModuleDestroy, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const CircuitBreaker = require('opossum');
import pRetry, { AbortError } from 'p-retry';
import { RateLimiterRedis, RateLimiterMemory } from 'rate-limiter-flexible';
import Redis from 'ioredis';
import { v4 as uuidv4 } from 'uuid';
import { createHash } from 'node:crypto';

import { LLMConfiguration } from '../../modules/llm/llm-configuration.entity';
import { LLMUsageTracking } from '../../modules/llm/llm-usage-tracking.entity';
import { LLMServiceConfig, loadLLMConfig } from '../../config/llm/llm.config';
import {
  ProviderRegistry,
  LLMProvider,
  LLMProviderType,
  ProviderRequest,
  ProviderResponse,
  AgentTaskType,
  ModelCapabilities,
} from './providers';
import { ModelRouter, RoutingOptions, BudgetMode, RoutingDecision } from './routing';

/**
 * Extended LLM Request with routing options
 */
export interface LLMRequest {
  messages: Array<{
    role: 'system' | 'user' | 'assistant' | 'tool';
    content: string;
    toolCalls?: Array<{ id: string; name: string; arguments: Record<string, unknown> }>;
    toolCallId?: string;
  }>;
  agentName?: string;
  purpose?: string;
  temperature?: number;
  maxTokens?: number;
  useCache?: boolean;
  bypassRateLimit?: boolean;
  // New routing options
  taskType?: AgentTaskType;
  preferredProvider?: LLMProviderType;
  preferredModel?: string;
  budgetMode?: BudgetMode;
  maxCost?: number;
  // GPT-5.2 specific
  reasoningEffort?: 'none' | 'low' | 'medium' | 'high' | 'xhigh';
  // Function calling
  tools?: import('./providers/types').ToolDefinition[];
  // Custom timeout in ms (overrides default)
  timeout?: number;
  // Skip retries and fail fast to fallback (useful for synthesize with long context)
  skipRetries?: boolean;
}

export interface LLMResponse {
  requestId: string;
  content: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cost: number;
  latencyMs: number;
  cacheHit: boolean;
  retryCount: number;
  modelUsed: string;
  providerUsed: string;
  // New fields
  routingDecision?: {
    reason: string;
    fallbacksAvailable: number;
  };
  // Function calling
  toolCalls?: import('./providers/types').ToolCall[];
}

export class BudgetExceededError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BudgetExceededError';
  }
}

export class RateLimitExceededError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RateLimitExceededError';
  }
}

export class NoProviderAvailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NoProviderAvailableError';
  }
}

export class CircuitBreakerOpenError extends Error {
  constructor(
    public readonly provider: string,
    message?: string,
  ) {
    super(message || `Circuit breaker is open for provider: ${provider}`);
    this.name = 'CircuitBreakerOpenError';
  }
}

@Injectable()
export class LLMService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(LLMService.name);
  private config: LLMServiceConfig;
  private circuitBreakers: Map<LLMProviderType, any> = new Map();
  private rateLimiter: RateLimiterMemory | RateLimiterRedis | null = null;
  private redis: Redis | null = null;

  constructor(
    @InjectRepository(LLMConfiguration)
    private readonly configRepository: Repository<LLMConfiguration>,
    @InjectRepository(LLMUsageTracking)
    private readonly usageRepository: Repository<LLMUsageTracking>,
    private readonly configService: ConfigService,
    @Optional() private readonly providerRegistry?: ProviderRegistry,
    @Optional() private readonly modelRouter?: ModelRouter,
  ) {}

  async onModuleInit() {
    await this.initialize();
  }

  async onModuleDestroy() {
    this.logger.log('Shutting down LLM Service...');

    // Shutdown all circuit breakers
    for (const [name, breaker] of this.circuitBreakers) {
      breaker.shutdown();
      this.logger.log(`Circuit breaker for ${name} shutdown`);
    }
    this.circuitBreakers.clear();

    // Close Redis connection
    if (this.redis) {
      this.redis.disconnect();
      this.redis = null;
      this.logger.log('Redis connection closed');
    }

    this.rateLimiter = null;
  }

  /**
   * Initialize the LLM service
   */
  private async initialize() {
    this.logger.log('Initializing LLM Service...');

    // Load configuration
    await this.loadConfiguration();

    // Initialize Redis for caching
    if (this.config.cache?.enabled) {
      this.initializeRedis();
    }

    // Initialize circuit breakers per provider
    this.initializeCircuitBreakers();

    // Initialize rate limiter
    this.initializeRateLimiter();

    // Log provider status
    if (this.providerRegistry) {
      const statuses = this.providerRegistry.getProviderStatuses();
      this.logger.log(
        `Available providers: ${
          statuses
            .filter((s) => s.available)
            .map((s) => s.name)
            .join(', ') || 'none'
        }`,
      );
    }

    this.logger.log('LLM Service initialized successfully');
  }

  /**
   * Load configuration from database or config file
   */
  private async loadConfiguration() {
    try {
      const dbConfig = await this.configRepository.findOne({
        where: { isActive: true },
      });

      if (dbConfig) {
        this.logger.log('Loaded LLM configuration from database');
        this.config = this.mapDatabaseConfigToServiceConfig(dbConfig);
      } else {
        this.logger.warn('No active database configuration found, using config file');
        this.config = loadLLMConfig();
      }
    } catch (error) {
      this.logger.warn('Failed to load database configuration, using config file', error);
      this.config = loadLLMConfig();
    }
  }

  private mapDatabaseConfigToServiceConfig(dbConfig: LLMConfiguration): LLMServiceConfig {
    const defaults = loadLLMConfig();
    return {
      primaryModel: dbConfig.primaryModel ?? defaults.primaryModel,
      fallbackModels: dbConfig.fallbackModels ?? defaults.fallbackModels,
      defaultTimeout: dbConfig.defaultTimeout ?? defaults.defaultTimeout,
      streamingEnabled: dbConfig.streamingEnabled ?? defaults.streamingEnabled,
      circuitBreaker: dbConfig.circuitBreakerConfig ?? defaults.circuitBreaker,
      retry: dbConfig.retryConfig ?? defaults.retry,
      rateLimit: dbConfig.rateLimitConfig ?? defaults.rateLimit,
      cache: dbConfig.cacheConfig ?? defaults.cache,
      budget: dbConfig.budgetConfig ?? defaults.budget,
      observability: dbConfig.observabilityConfig ?? defaults.observability,
    };
  }

  /**
   * Initialize Redis for caching
   */
  private initializeRedis() {
    const isTest = process.env.NODE_ENV === 'test';
    try {
      this.redis = new Redis({
        host: this.configService.get<string>('REDIS_HOST') || 'redis',
        port: this.configService.get<number>('REDIS_PORT') || 6379,
        maxRetriesPerRequest: isTest ? 0 : 3,
        retryStrategy: (times) => {
          if (isTest || times > 3) return null;
          return Math.min(times * 50, 2000);
        },
        lazyConnect: isTest,
      });

      this.redis.on('error', (error) => {
        this.logger.error('Redis connection error', error);
      });

      this.redis.on('connect', () => {
        this.logger.log('Redis connected for LLM caching');
      });
    } catch (error) {
      this.logger.error('Failed to initialize Redis', error);
      this.redis = null;
    }
  }

  /**
   * Initialize circuit breakers for each provider
   */
  private initializeCircuitBreakers() {
    if (!this.config.circuitBreaker.enabled) {
      this.logger.warn('Circuit breakers disabled');
      return;
    }

    const providers: LLMProviderType[] = ['openai', 'anthropic', 'ollama'];

    for (const providerName of providers) {
      const options = {
        timeout: this.config.defaultTimeout,
        errorThresholdPercentage: 50,
        volumeThreshold: this.config.circuitBreaker.failureThreshold,
        resetTimeout: this.config.circuitBreaker.timeout,
        rollingCountTimeout: this.config.circuitBreaker.monitoringWindow,
        rollingCountBuckets: 10,
        name: `LLMCircuitBreaker-${providerName}`,
      };

      const breaker = new CircuitBreaker(
        (request: ProviderRequest, provider: LLMProvider) => provider.invoke(request),
        options,
      );

      breaker.on('open', () => {
        const stats = breaker.stats;
        this.logger.error(
          `Circuit breaker OPENED for ${providerName}: ` +
            `failures=${stats.failures}, timeouts=${stats.timeouts}, ` +
            `successes=${stats.successes}, rejects=${stats.rejects}`,
        );
      });

      breaker.on('halfOpen', () => {
        this.logger.warn(`Circuit breaker half-open for ${providerName}, testing recovery...`);
      });

      breaker.on('close', () => {
        this.logger.log(`Circuit breaker CLOSED for ${providerName}, service recovered`);
      });

      breaker.on('timeout', () => {
        this.logger.warn(`Circuit breaker timeout for ${providerName}`);
      });

      breaker.on('failure', (error: Error) => {
        this.logger.warn(
          `Circuit breaker failure for ${providerName}: ${error.message?.substring(0, 100)}`,
        );
      });

      this.circuitBreakers.set(providerName, breaker);
    }

    this.logger.log(`Initialized ${this.circuitBreakers.size} circuit breakers`);
  }

  /**
   * Initialize rate limiter
   */
  private initializeRateLimiter() {
    if (!this.config.rateLimit.enabled) {
      this.logger.warn('Rate limiter disabled');
      return;
    }

    const opts = {
      points: this.config.rateLimit.requestsPerMinute,
      duration: 60,
      blockDuration: 0,
    };

    if (this.redis) {
      this.rateLimiter = new RateLimiterRedis({
        storeClient: this.redis,
        keyPrefix: 'llm:ratelimit:',
        ...opts,
      });
      this.logger.log(`Rate limiter initialized (Redis): ${opts.points} req/min`);
    } else {
      this.rateLimiter = new RateLimiterMemory(opts);
      this.logger.log(`Rate limiter initialized (Memory): ${opts.points} req/min`);
    }
  }

  /**
   * Main public method to invoke LLM
   */
  async invoke(request: LLMRequest): Promise<LLMResponse> {
    const requestId = uuidv4();
    const startTime = Date.now();

    this.logger.log(`LLM request ${requestId} from agent: ${request.agentName || 'unknown'}`);

    try {
      // Check budget
      await this.checkBudget();

      // Try cache
      if (request.useCache !== false && this.config.cache?.enabled) {
        const cached = await this.getCachedResponse(request);
        if (cached) {
          this.logger.log(`Cache hit for request ${requestId}`);
          return { ...cached, requestId, cacheHit: true };
        }
      }

      // Execute with rate limiting
      const response = await this.executeWithRateLimit(
        request,
        requestId,
        startTime,
        request.bypassRateLimit || false,
      );

      // Cache response
      if (request.useCache !== false && this.config.cache?.enabled) {
        await this.cacheResponse(request, response);
      }

      // Track usage
      await this.trackUsage(request, response, true, null);

      return response;
    } catch (error) {
      const latencyMs = Date.now() - startTime;
      this.logger.error(`LLM request ${requestId} failed after ${latencyMs}ms`, error.stack);

      await this.trackUsage(
        request,
        {
          requestId,
          content: '',
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 0,
          cost: 0,
          latencyMs,
          cacheHit: false,
          retryCount: 0,
          modelUsed: request.preferredModel || 'unknown',
          providerUsed: request.preferredProvider || 'unknown',
        },
        false,
        error.message,
      );

      throw error;
    }
  }

  /**
   * Execute with rate limiting
   */
  private async executeWithRateLimit(
    request: LLMRequest,
    requestId: string,
    startTime: number,
    bypassRateLimit: boolean,
  ): Promise<LLMResponse> {
    if (bypassRateLimit || !this.config.rateLimit.enabled || !this.rateLimiter) {
      return this.executeWithRetry(request, requestId, startTime);
    }

    try {
      const rateLimitKey = request.agentName || 'default';
      await this.rateLimiter.consume(rateLimitKey, 1);
      return await this.executeWithRetry(request, requestId, startTime);
    } catch (error) {
      if (error.msBeforeNext !== undefined) {
        throw new RateLimitExceededError(
          `Rate limit exceeded. Try again in ${Math.ceil(error.msBeforeNext / 1000)} seconds`,
        );
      }
      throw error;
    }
  }

  /**
   * Execute with retry logic
   */
  private async executeWithRetry(
    request: LLMRequest,
    requestId: string,
    startTime: number,
  ): Promise<LLMResponse> {
    // Skip retries if disabled globally or requested (for fail-fast to fallback)
    if (!this.config.retry.enabled || request.skipRetries) {
      if (request.skipRetries) {
        this.logger.debug(`Skipping retries for ${requestId} (fail-fast mode)`);
      }
      return this.executeWithRouting(request, requestId, startTime, 0);
    }

    let attemptCount = 0;

    return pRetry(
      async () => {
        attemptCount++;
        return this.executeWithRouting(request, requestId, startTime, attemptCount - 1);
      },
      {
        retries: this.config.retry.maxRetries,
        factor: this.config.retry.backoffMultiplier,
        minTimeout: this.config.retry.initialDelay,
        maxTimeout: this.config.retry.maxDelay,
        onFailedAttempt: (error) => {
          this.logger.warn(`Retry attempt ${error.attemptNumber} failed for ${requestId}`);
          // Abort retries for non-recoverable errors
          if (
            error instanceof BudgetExceededError ||
            error instanceof AbortError ||
            error instanceof CircuitBreakerOpenError
          ) {
            throw error;
          }
        },
      },
    );
  }

  /**
   * Execute with intelligent routing
   */
  private async executeWithRouting(
    request: LLMRequest,
    requestId: string,
    startTime: number,
    retryCount: number,
  ): Promise<LLMResponse> {
    // If no provider registry, fall back to legacy behavior
    if (!this.providerRegistry || !this.modelRouter) {
      return this.executeLegacy(request, requestId, startTime, retryCount);
    }

    // Get routing decision
    const routingOptions: RoutingOptions = {
      taskType: request.taskType || AgentTaskType.CHAT,
      budgetMode: request.budgetMode,
      maxCost: request.maxCost,
      forceProvider: request.preferredProvider,
      forceModel: request.preferredModel,
      allowLocalModels: true,
      allowCloudModels: true,
    };

    let decision: RoutingDecision;
    try {
      decision = await this.modelRouter.route(routingOptions);
    } catch (error) {
      this.logger.warn(`Routing failed: ${error.message}, falling back to legacy`);
      return this.executeLegacy(request, requestId, startTime, retryCount);
    }

    // Get provider
    const provider = this.providerRegistry.getProvider(decision.provider);
    if (!provider) {
      throw new NoProviderAvailableError(`Provider ${decision.provider} not available`);
    }

    // Build provider request with custom timeout support
    const effectiveTimeout = request.timeout || this.config.defaultTimeout;
    const providerRequest: ProviderRequest = {
      messages: this.convertMessages(request.messages),
      model: decision.model,
      tools: request.tools,
      options: {
        temperature: request.temperature,
        maxTokens: request.maxTokens,
        timeout: effectiveTimeout,
        reasoningEffort: decision.reasoningEffort || request.reasoningEffort,
      },
      metadata: {
        requestId,
        agentName: request.agentName,
        purpose: request.purpose,
        taskType: request.taskType,
      },
    };

    // Execute with circuit breaker
    const response = await this.executeWithCircuitBreaker(
      providerRequest,
      provider,
      decision,
      retryCount,
    );

    const latencyMs = Date.now() - startTime;

    // Calculate cost
    const cost =
      response.usage.inputTokens * decision.capabilities.costPerInputToken +
      response.usage.outputTokens * decision.capabilities.costPerOutputToken;

    return {
      requestId,
      content: response.content,
      inputTokens: response.usage.inputTokens,
      outputTokens: response.usage.outputTokens,
      totalTokens: response.usage.totalTokens,
      cost,
      latencyMs,
      cacheHit: false,
      retryCount,
      modelUsed: response.modelUsed,
      providerUsed: response.providerUsed,
      routingDecision: {
        reason: decision.reason,
        fallbacksAvailable: decision.fallbacks.length,
      },
      toolCalls: response.toolCalls,
    };
  }

  /**
   * Execute with circuit breaker and fallback
   */
  private async executeWithCircuitBreaker(
    request: ProviderRequest,
    provider: LLMProvider,
    decision: RoutingDecision,
    retryCount: number,
  ): Promise<ProviderResponse> {
    const breaker = this.circuitBreakers.get(provider.name);

    // If no circuit breaker, execute directly
    if (!breaker || !this.config.circuitBreaker.enabled) {
      return provider.invoke(request);
    }

    try {
      return await breaker.fire(request, provider);
    } catch (error: any) {
      const isBreakerOpen = error.message?.includes('Breaker is open');

      // If circuit is open, try fallbacks
      if (isBreakerOpen && decision.fallbacks.length > 0) {
        this.logger.warn(`Circuit open for ${provider.name}, trying fallbacks`);
        try {
          return await this.tryFallbacks(request, decision.fallbacks);
        } catch (fallbackError) {
          // All fallbacks failed - throw CircuitBreakerOpenError to prevent retries
          throw new CircuitBreakerOpenError(
            provider.name,
            `Circuit breaker open for ${provider.name} and all fallbacks failed`,
          );
        }
      }

      // If breaker is open with no fallbacks, throw specific error to abort retries
      if (isBreakerOpen) {
        throw new CircuitBreakerOpenError(
          provider.name,
          `Circuit breaker open for ${provider.name}, no fallbacks available`,
        );
      }

      throw error;
    }
  }

  /**
   * Try fallback providers/models
   */
  private async tryFallbacks(
    request: ProviderRequest,
    fallbacks: Array<{ provider: LLMProviderType; model: string }>,
  ): Promise<ProviderResponse> {
    for (let i = 0; i < fallbacks.length; i++) {
      const fallback = fallbacks[i];
      this.logger.log(
        `Trying fallback ${i + 1}/${fallbacks.length}: ${fallback.provider}:${fallback.model}`,
      );

      const provider = this.providerRegistry?.getProvider(fallback.provider);
      if (!provider) continue;

      const isAvailable = await provider.isAvailable();
      if (!isAvailable) continue;

      try {
        const fallbackRequest = { ...request, model: fallback.model };
        const breaker = this.circuitBreakers.get(fallback.provider);

        if (breaker && !breaker.opened) {
          return await breaker.fire(fallbackRequest, provider);
        } else {
          return await provider.invoke(fallbackRequest);
        }
      } catch (error) {
        this.logger.warn(
          `Fallback ${fallback.provider}:${fallback.model} failed: ${error.message}`,
        );
      }
    }

    throw new NoProviderAvailableError('All providers and fallbacks failed');
  }

  /**
   * Legacy execution (backward compatibility)
   */
  private async executeLegacy(
    request: LLMRequest,
    requestId: string,
    startTime: number,
    retryCount: number,
  ): Promise<LLMResponse> {
    // Use default provider from config
    const provider = this.providerRegistry?.getProvider(
      this.config.primaryModel.provider as LLMProviderType,
    );

    if (!provider) {
      throw new NoProviderAvailableError(
        `Default provider ${this.config.primaryModel.provider} not available`,
      );
    }

    const legacyTimeout = request.timeout || this.config.defaultTimeout;
    const providerRequest: ProviderRequest = {
      messages: this.convertMessages(request.messages),
      model: this.config.primaryModel.modelName,
      tools: request.tools,
      options: {
        temperature: request.temperature ?? this.config.primaryModel.temperature,
        maxTokens: request.maxTokens ?? this.config.primaryModel.maxTokens,
        timeout: legacyTimeout,
      },
      metadata: {
        requestId,
        agentName: request.agentName,
        purpose: request.purpose,
      },
    };

    const response = await provider.invoke(providerRequest);
    const latencyMs = Date.now() - startTime;

    const cost =
      response.usage.inputTokens * this.config.primaryModel.costPerInputToken +
      response.usage.outputTokens * this.config.primaryModel.costPerOutputToken;

    return {
      requestId,
      content: response.content,
      inputTokens: response.usage.inputTokens,
      outputTokens: response.usage.outputTokens,
      totalTokens: response.usage.totalTokens,
      cost,
      latencyMs,
      cacheHit: false,
      retryCount,
      modelUsed: response.modelUsed,
      toolCalls: response.toolCalls,
      providerUsed: response.providerUsed,
    };
  }

  /**
   * Check budget limits
   */
  private async checkBudget(): Promise<void> {
    if (!this.config.budget.enabled) return;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

    const dailyCostResult = await this.usageRepository
      .createQueryBuilder('usage')
      .select('SUM(usage.total_cost)', 'total')
      .where('usage.created_at >= :today', { today })
      .andWhere('usage.success = :success', { success: true })
      .getRawOne();

    const dailyCost = Number.parseFloat(dailyCostResult?.total || '0');

    const monthlyCostResult = await this.usageRepository
      .createQueryBuilder('usage')
      .select('SUM(usage.total_cost)', 'total')
      .where('usage.created_at >= :monthStart', { monthStart })
      .andWhere('usage.success = :success', { success: true })
      .getRawOne();

    const monthlyCost = Number.parseFloat(monthlyCostResult?.total || '0');

    if (this.config.budget.hardStop && dailyCost >= this.config.budget.dailyLimit) {
      throw new BudgetExceededError(
        `Daily budget limit exceeded: $${dailyCost.toFixed(2)} / $${this.config.budget.dailyLimit}`,
      );
    }

    if (this.config.budget.hardStop && monthlyCost >= this.config.budget.monthlyLimit) {
      throw new BudgetExceededError(
        `Monthly budget limit exceeded: $${monthlyCost.toFixed(2)} / $${this.config.budget.monthlyLimit}`,
      );
    }

    const dailyThreshold =
      (this.config.budget.dailyLimit * this.config.budget.alertThreshold) / 100;
    const monthlyThreshold =
      (this.config.budget.monthlyLimit * this.config.budget.alertThreshold) / 100;

    if (dailyCost >= dailyThreshold) {
      this.logger.warn(
        `Daily budget alert: $${dailyCost.toFixed(2)} / $${this.config.budget.dailyLimit}`,
      );
    }

    if (monthlyCost >= monthlyThreshold) {
      this.logger.warn(
        `Monthly budget alert: $${monthlyCost.toFixed(2)} / $${this.config.budget.monthlyLimit}`,
      );
    }
  }

  /**
   * Get cached response
   */
  private async getCachedResponse(request: LLMRequest): Promise<LLMResponse | null> {
    if (!this.redis || !this.config.cache?.enabled) return null;

    try {
      const cacheKey = this.generateCacheKey(request);
      const cached = await this.redis.get(cacheKey);
      if (cached) return JSON.parse(cached);
    } catch (error) {
      this.logger.warn('Failed to get cached response', error);
    }

    return null;
  }

  /**
   * Cache response
   */
  private async cacheResponse(request: LLMRequest, response: LLMResponse): Promise<void> {
    if (!this.redis || !this.config.cache?.enabled) return;

    try {
      const cacheKey = this.generateCacheKey(request);
      await this.redis.setex(cacheKey, this.config.cache.ttl, JSON.stringify(response));
    } catch (error) {
      this.logger.warn('Failed to cache response', error);
    }
  }

  /**
   * Generate cache key
   */
  private generateCacheKey(request: LLMRequest): string {
    const requestString = JSON.stringify({
      messages: request.messages,
      temperature: request.temperature,
      maxTokens: request.maxTokens,
      preferredProvider: request.preferredProvider,
      preferredModel: request.preferredModel,
    });

    const hash = createHash('sha256').update(requestString).digest('hex');
    return `${this.config.cache.keyPrefix}${hash}`;
  }

  /**
   * Track usage
   */
  private async trackUsage(
    request: LLMRequest,
    response: LLMResponse,
    success: boolean,
    errorMessage: string | null,
  ): Promise<void> {
    try {
      const tracking = this.usageRepository.create({
        requestId: response.requestId,
        provider: response.providerUsed,
        modelName: response.modelUsed,
        inputTokens: response.inputTokens,
        outputTokens: response.outputTokens,
        totalTokens: response.totalTokens,
        inputCost: 0, // Will be calculated based on actual provider
        outputCost: 0,
        totalCost: response.cost,
        latencyMs: response.latencyMs,
        cacheHit: response.cacheHit,
        retryCount: response.retryCount,
        circuitBreakerOpen: false,
        agentName: request.agentName || null,
        purpose: request.purpose || null,
        success,
        errorMessage,
      });

      await this.usageRepository.save(tracking);
    } catch (error) {
      this.logger.error('Failed to track usage', error);
    }
  }

  // ============================================================
  // Public utility methods
  // ============================================================

  /**
   * Get available providers
   */
  getAvailableProviders(): LLMProviderType[] {
    return this.providerRegistry?.getProviderNames() || [];
  }

  /**
   * Get provider status
   */
  getProviderStatuses() {
    return this.providerRegistry?.getProviderStatuses() || [];
  }

  /**
   * Get model capabilities
   */
  getModelCapabilities(model: string): ModelCapabilities | undefined {
    return this.providerRegistry?.getModelCapabilities(model);
  }

  /**
   * Estimate cost for a task
   */
  estimateTaskCost(
    taskType: AgentTaskType,
    inputTokens: number,
    outputTokens: number,
    budgetMode?: BudgetMode,
  ) {
    return this.modelRouter?.estimateTaskCost(taskType, inputTokens, outputTokens, budgetMode);
  }

  /**
   * Convert LLMRequest messages to ProviderMessage format
   */
  private convertMessages(
    messages: LLMRequest['messages'],
  ): import('./providers/types').ProviderMessage[] {
    return messages.map((msg) => ({
      role: msg.role,
      content: msg.content,
      toolCalls: msg.toolCalls,
      toolCallId: msg.toolCallId,
    }));
  }

  /**
   * Get recommended models for a task
   */
  getRecommendedModels(taskType: AgentTaskType, budgetMode?: BudgetMode) {
    return this.modelRouter?.getRecommendedModels(taskType, budgetMode);
  }
}
