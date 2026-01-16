/**
 * BOOTSTRAP SCAFFOLDING - DO NOT DEPEND ON THIS
 * Scaffold ID: BS-003
 * Type: Runtime
 * Purpose: Production-ready LLM service abstraction with safeguards
 * Exit Criterion: LLM service is production-validated and patterns are proven
 * Target Removal: Phase 2 (will be promoted to permanent infrastructure)
 * Owner: @jasontalley
 *
 * This service provides a production-ready abstraction layer for LLM interactions
 * with circuit breakers, retries, rate limiting, cost tracking, and caching.
 */

import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ChatOpenAI } from '@langchain/openai';
import { BaseMessage, HumanMessage, SystemMessage } from '@langchain/core/messages';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const CircuitBreaker = require('opossum');
import pRetry, { AbortError } from 'p-retry';
import { RateLimiterRedis, RateLimiterMemory } from 'rate-limiter-flexible';
import Redis from 'ioredis';
import { v4 as uuidv4 } from 'uuid';
import { createHash } from 'crypto';

import { LLMConfiguration } from '../../modules/llm/llm-configuration.entity';
import { LLMUsageTracking } from '../../modules/llm/llm-usage-tracking.entity';
import { LLMServiceConfig, LLMModelConfig, loadLLMConfig } from '../../config/llm/llm.config';

export interface LLMRequest {
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  agentName?: string;
  purpose?: string;
  temperature?: number;
  maxTokens?: number;
  useCache?: boolean;
  bypassRateLimit?: boolean; // For emergency scenarios only
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

@Injectable()
export class LLMService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(LLMService.name);
  private config: LLMServiceConfig;
  private circuitBreaker: any; // Circuit breaker instance
  private rateLimiter: RateLimiterMemory | RateLimiterRedis | null = null;
  private redis: Redis | null = null;
  private primaryLLM: ChatOpenAI;
  private fallbackLLMs: ChatOpenAI[] = [];

  constructor(
    @InjectRepository(LLMConfiguration)
    private configRepository: Repository<LLMConfiguration>,
    @InjectRepository(LLMUsageTracking)
    private usageRepository: Repository<LLMUsageTracking>,
    private configService: ConfigService,
  ) {}

  async onModuleInit() {
    await this.initialize();
  }

  async onModuleDestroy() {
    this.logger.log('Shutting down LLM Service...');

    // Shutdown circuit breaker first (has internal timers)
    if (this.circuitBreaker) {
      this.circuitBreaker.shutdown();
      this.circuitBreaker = null;
      this.logger.log('Circuit breaker shutdown');
    }

    // Close Redis connection - use disconnect() for immediate cleanup
    // quit() is graceful but can hang if retryStrategy keeps reconnecting
    if (this.redis) {
      this.redis.disconnect();
      this.redis = null;
      this.logger.log('Redis connection closed');
    }

    // Clear rate limiter reference
    this.rateLimiter = null;
  }

  /**
   * Initialize the LLM service with configuration from database or config file
   */
  private async initialize() {
    this.logger.log('Initializing LLM Service...');

    // Load configuration (database takes precedence over config file)
    await this.loadConfiguration();

    // Initialize Redis for caching
    if (this.config.cache.enabled) {
      this.initializeRedis();
    }

    // Initialize LLM clients
    this.initializeLLMClients();

    // Initialize circuit breaker
    this.initializeCircuitBreaker();

    // Initialize rate limiter
    this.initializeRateLimiter();

    this.logger.log('LLM Service initialized successfully');
  }

  /**
   * Load configuration from database or fall back to config file
   */
  private async loadConfiguration() {
    try {
      // Try to load active configuration from database
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

  /**
   * Map database configuration to service configuration
   */
  private mapDatabaseConfigToServiceConfig(dbConfig: LLMConfiguration): LLMServiceConfig {
    return {
      primaryModel: dbConfig.primaryModel,
      fallbackModels: dbConfig.fallbackModels,
      defaultTimeout: dbConfig.defaultTimeout,
      streamingEnabled: dbConfig.streamingEnabled,
      circuitBreaker: dbConfig.circuitBreakerConfig,
      retry: dbConfig.retryConfig,
      rateLimit: dbConfig.rateLimitConfig,
      cache: dbConfig.cacheConfig,
      budget: dbConfig.budgetConfig,
      observability: dbConfig.observabilityConfig,
    };
  }

  /**
   * Initialize Redis connection for caching
   */
  private initializeRedis() {
    const isTest = process.env.NODE_ENV === 'test';
    try {
      this.redis = new Redis({
        host: this.configService.get<string>('REDIS_HOST') || 'redis',
        port: this.configService.get<number>('REDIS_PORT') || 6379,
        maxRetriesPerRequest: isTest ? 0 : 3,
        retryStrategy: (times) => {
          // In test mode, don't retry to prevent Jest from hanging
          if (isTest || times > 3) {
            return null; // Stop retrying
          }
          const delay = Math.min(times * 50, 2000);
          return delay;
        },
        lazyConnect: isTest, // Don't connect immediately in tests
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
   * Initialize LLM clients (primary and fallbacks)
   */
  private initializeLLMClients() {
    // Initialize primary model
    this.primaryLLM = this.createLLMClient(this.config.primaryModel);

    // Initialize fallback models
    this.fallbackLLMs = this.config.fallbackModels.map((modelConfig) =>
      this.createLLMClient(modelConfig),
    );

    this.logger.log(
      `Initialized ${1 + this.fallbackLLMs.length} LLM clients (1 primary, ${this.fallbackLLMs.length} fallbacks)`,
    );
  }

  /**
   * Create an LLM client from configuration
   */
  private createLLMClient(modelConfig: LLMModelConfig): ChatOpenAI {
    const apiKey = modelConfig.apiKey || this.configService.get<string>('OPENAI_API_KEY');

    if (!apiKey) {
      this.logger.warn(
        `No API key configured for ${modelConfig.provider}:${modelConfig.modelName}`,
      );
    }

    return new ChatOpenAI({
      modelName: modelConfig.modelName,
      temperature: modelConfig.temperature,
      maxTokens: modelConfig.maxTokens,
      openAIApiKey: apiKey,
      timeout: this.config.defaultTimeout,
    });
  }

  /**
   * Initialize circuit breaker for fault tolerance
   */
  private initializeCircuitBreaker() {
    if (!this.config.circuitBreaker.enabled) {
      this.logger.warn('Circuit breaker is disabled');
      return;
    }

    const options = {
      timeout: this.config.defaultTimeout,
      errorThresholdPercentage: (this.config.circuitBreaker.failureThreshold / 10) * 100,
      resetTimeout: this.config.circuitBreaker.timeout,
      rollingCountTimeout: this.config.circuitBreaker.monitoringWindow,
      rollingCountBuckets: 10,
      name: 'LLMCircuitBreaker',
    };

    this.circuitBreaker = new CircuitBreaker(this.executeLLMCall.bind(this), options);

    // Circuit breaker event listeners
    this.circuitBreaker.on('open', () => {
      this.logger.error('Circuit breaker opened - too many LLM failures');
    });

    this.circuitBreaker.on('halfOpen', () => {
      this.logger.warn('Circuit breaker half-open - testing LLM availability');
    });

    this.circuitBreaker.on('close', () => {
      this.logger.log('Circuit breaker closed - LLM service restored');
    });

    this.logger.log('Circuit breaker initialized');
  }

  /**
   * Initialize rate limiter for request throttling
   */
  private initializeRateLimiter() {
    if (!this.config.rateLimit.enabled) {
      this.logger.warn('Rate limiter is disabled');
      return;
    }

    const opts = {
      points: this.config.rateLimit.requestsPerMinute,
      duration: 60, // Per 60 seconds
      blockDuration: 0, // Do not block, just reject
    };

    // Use Redis-based rate limiter if Redis is available, otherwise use in-memory
    if (this.redis) {
      this.rateLimiter = new RateLimiterRedis({
        storeClient: this.redis,
        keyPrefix: 'llm:ratelimit:',
        ...opts,
      });
      this.logger.log(
        `Rate limiter initialized (Redis): ${this.config.rateLimit.requestsPerMinute} req/min`,
      );
    } else {
      this.rateLimiter = new RateLimiterMemory(opts);
      this.logger.log(
        `Rate limiter initialized (Memory): ${this.config.rateLimit.requestsPerMinute} req/min`,
      );
    }
  }

  /**
   * Main public method to invoke LLM
   */
  async invoke(request: LLMRequest): Promise<LLMResponse> {
    const requestId = uuidv4();
    const startTime = Date.now();
    let retryCount = 0;

    this.logger.log(`LLM request ${requestId} from agent: ${request.agentName || 'unknown'}`);

    try {
      // Check budget before making request
      await this.checkBudget();

      // Try to get cached response
      if (request.useCache !== false && this.config.cache.enabled) {
        const cachedResponse = await this.getCachedResponse(request);
        if (cachedResponse) {
          this.logger.log(`Cache hit for request ${requestId}`);
          return {
            ...cachedResponse,
            requestId,
            cacheHit: true,
          };
        }
      }

      // Execute with rate limiting
      const response = await this.executeWithRateLimit(
        request,
        requestId,
        startTime,
        request.bypassRateLimit || false,
      );

      // Cache the response
      if (request.useCache !== false && this.config.cache.enabled) {
        await this.cacheResponse(request, response);
      }

      // Track usage
      await this.trackUsage(request, response, true, null);

      return response;
    } catch (error) {
      const latencyMs = Date.now() - startTime;
      this.logger.error(`LLM request ${requestId} failed after ${latencyMs}ms`, error.stack);

      // Track failed usage
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
          retryCount,
          modelUsed: this.config.primaryModel.modelName,
          providerUsed: this.config.primaryModel.provider,
        },
        false,
        error.message,
      );

      throw error;
    }
  }

  /**
   * Execute LLM call with rate limiting
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
      // Consume 1 point from rate limiter
      // Use agent name or 'default' as key for distributed rate limiting
      const rateLimitKey = request.agentName || 'default';
      await this.rateLimiter.consume(rateLimitKey, 1);

      return await this.executeWithRetry(request, requestId, startTime);
    } catch (error) {
      // rate-limiter-flexible throws RateLimiterRes when limit exceeded
      if (error.msBeforeNext !== undefined) {
        throw new RateLimitExceededError(
          `Rate limit exceeded. Try again in ${Math.ceil(error.msBeforeNext / 1000)} seconds`,
        );
      }
      throw error;
    }
  }

  /**
   * Execute LLM call with retry logic
   */
  private async executeWithRetry(
    request: LLMRequest,
    requestId: string,
    startTime: number,
  ): Promise<LLMResponse> {
    if (!this.config.retry.enabled) {
      return this.executeWithCircuitBreaker(request, requestId, startTime, 0);
    }

    let attemptCount = 0;

    return pRetry(
      async () => {
        attemptCount++;
        return this.executeWithCircuitBreaker(request, requestId, startTime, attemptCount - 1);
      },
      {
        retries: this.config.retry.maxRetries,
        factor: this.config.retry.backoffMultiplier,
        minTimeout: this.config.retry.initialDelay,
        maxTimeout: this.config.retry.maxDelay,
        onFailedAttempt: (error) => {
          this.logger.warn(`Retry attempt ${error.attemptNumber} failed for request ${requestId}`);

          // Don't retry on budget errors or non-retryable errors
          if (error instanceof BudgetExceededError || error instanceof AbortError) {
            throw error;
          }
        },
      },
    );
  }

  /**
   * Execute LLM call with circuit breaker
   */
  private async executeWithCircuitBreaker(
    request: LLMRequest,
    requestId: string,
    startTime: number,
    retryCount: number,
  ): Promise<LLMResponse> {
    if (!this.config.circuitBreaker.enabled) {
      return this.executeLLMCall(request, requestId, startTime, retryCount);
    }

    try {
      return (await this.circuitBreaker.fire(
        request,
        requestId,
        startTime,
        retryCount,
      )) as LLMResponse;
    } catch (error: any) {
      if (error.message && error.message.includes('Breaker is open')) {
        this.logger.error('Circuit breaker is open, trying fallback models if available');

        // Try fallback models if circuit is open
        if (this.fallbackLLMs.length > 0) {
          return this.tryFallbackModels(request, requestId, startTime, retryCount);
        }
      }
      throw error;
    }
  }

  /**
   * Try fallback models when primary fails
   */
  private async tryFallbackModels(
    request: LLMRequest,
    requestId: string,
    startTime: number,
    retryCount: number,
  ): Promise<LLMResponse> {
    for (let i = 0; i < this.fallbackLLMs.length; i++) {
      try {
        this.logger.log(`Trying fallback model ${i + 1}/${this.fallbackLLMs.length}`);
        const fallbackLLM = this.fallbackLLMs[i];
        const fallbackConfig = this.config.fallbackModels[i];

        return await this.executeLLMCallDirect(
          request,
          requestId,
          startTime,
          retryCount,
          fallbackLLM,
          fallbackConfig,
        );
      } catch (error) {
        this.logger.warn(`Fallback model ${i + 1} failed: ${error.message}`);
        if (i === this.fallbackLLMs.length - 1) {
          throw error; // Last fallback failed, propagate error
        }
      }
    }

    throw new Error('All fallback models failed');
  }

  /**
   * Execute the actual LLM API call
   */
  private async executeLLMCall(
    request: LLMRequest,
    requestId: string,
    startTime: number,
    retryCount: number,
  ): Promise<LLMResponse> {
    return this.executeLLMCallDirect(
      request,
      requestId,
      startTime,
      retryCount,
      this.primaryLLM,
      this.config.primaryModel,
    );
  }

  /**
   * Execute LLM call with specific client and config
   */
  private async executeLLMCallDirect(
    request: LLMRequest,
    requestId: string,
    startTime: number,
    retryCount: number,
    llmClient: ChatOpenAI,
    modelConfig: LLMModelConfig,
  ): Promise<LLMResponse> {
    // Convert request messages to LangChain format
    const messages: BaseMessage[] = request.messages.map((msg) => {
      if (msg.role === 'system') {
        return new SystemMessage(msg.content);
      }
      return new HumanMessage(msg.content);
    });

    // Invoke the LLM
    const response = await llmClient.invoke(messages);

    const latencyMs = Date.now() - startTime;

    // Extract token usage (OpenAI provides this in response metadata)
    const inputTokens = (response as any).response_metadata?.tokenUsage?.promptTokens || 0;
    const outputTokens = (response as any).response_metadata?.tokenUsage?.completionTokens || 0;
    const totalTokens = inputTokens + outputTokens;

    // Calculate cost
    const inputCost = inputTokens * modelConfig.costPerInputToken;
    const outputCost = outputTokens * modelConfig.costPerOutputToken;
    const totalCost = inputCost + outputCost;

    return {
      requestId,
      content: response.content as string,
      inputTokens,
      outputTokens,
      totalTokens,
      cost: totalCost,
      latencyMs,
      cacheHit: false,
      retryCount,
      modelUsed: modelConfig.modelName,
      providerUsed: modelConfig.provider,
    };
  }

  /**
   * Check if budget allows this request
   */
  private async checkBudget(): Promise<void> {
    if (!this.config.budget.enabled) {
      return;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

    // Get daily cost
    const dailyCostResult = await this.usageRepository
      .createQueryBuilder('usage')
      .select('SUM(usage.total_cost)', 'total')
      .where('usage.created_at >= :today', { today })
      .andWhere('usage.success = :success', { success: true })
      .getRawOne();

    const dailyCost = parseFloat(dailyCostResult?.total || '0');

    // Get monthly cost
    const monthlyCostResult = await this.usageRepository
      .createQueryBuilder('usage')
      .select('SUM(usage.total_cost)', 'total')
      .where('usage.created_at >= :monthStart', { monthStart })
      .andWhere('usage.success = :success', { success: true })
      .getRawOne();

    const monthlyCost = parseFloat(monthlyCostResult?.total || '0');

    // Check budget limits
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

    // Check alert thresholds
    const dailyThreshold =
      (this.config.budget.dailyLimit * this.config.budget.alertThreshold) / 100;
    const monthlyThreshold =
      (this.config.budget.monthlyLimit * this.config.budget.alertThreshold) / 100;

    if (dailyCost >= dailyThreshold) {
      this.logger.warn(
        `Daily budget alert: $${dailyCost.toFixed(2)} / $${this.config.budget.dailyLimit} (${((dailyCost / this.config.budget.dailyLimit) * 100).toFixed(1)}%)`,
      );
    }

    if (monthlyCost >= monthlyThreshold) {
      this.logger.warn(
        `Monthly budget alert: $${monthlyCost.toFixed(2)} / $${this.config.budget.monthlyLimit} (${((monthlyCost / this.config.budget.monthlyLimit) * 100).toFixed(1)}%)`,
      );
    }
  }

  /**
   * Get cached response if available
   */
  private async getCachedResponse(request: LLMRequest): Promise<LLMResponse | null> {
    if (!this.redis || !this.config.cache.enabled) {
      return null;
    }

    try {
      const cacheKey = this.generateCacheKey(request);
      const cached = await this.redis.get(cacheKey);

      if (cached) {
        return JSON.parse(cached);
      }
    } catch (error) {
      this.logger.warn('Failed to get cached response', error);
    }

    return null;
  }

  /**
   * Cache the LLM response
   */
  private async cacheResponse(request: LLMRequest, response: LLMResponse): Promise<void> {
    if (!this.redis || !this.config.cache.enabled) {
      return;
    }

    try {
      const cacheKey = this.generateCacheKey(request);
      await this.redis.setex(cacheKey, this.config.cache.ttl, JSON.stringify(response));
    } catch (error) {
      this.logger.warn('Failed to cache response', error);
    }
  }

  /**
   * Generate cache key from request
   */
  private generateCacheKey(request: LLMRequest): string {
    const requestString = JSON.stringify({
      messages: request.messages,
      temperature: request.temperature || this.config.primaryModel.temperature,
      maxTokens: request.maxTokens || this.config.primaryModel.maxTokens,
    });

    const hash = createHash('sha256').update(requestString).digest('hex');
    return `${this.config.cache.keyPrefix}${hash}`;
  }

  /**
   * Track LLM usage in database
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
        inputCost: response.inputTokens * this.config.primaryModel.costPerInputToken,
        outputCost: response.outputTokens * this.config.primaryModel.costPerOutputToken,
        totalCost: response.cost,
        latencyMs: response.latencyMs,
        cacheHit: response.cacheHit,
        retryCount: response.retryCount,
        circuitBreakerOpen: this.circuitBreaker?.opened || false,
        agentName: request.agentName || null,
        purpose: request.purpose || null,
        success,
        errorMessage,
      });

      await this.usageRepository.save(tracking);
    } catch (error) {
      this.logger.error('Failed to track usage', error);
      // Don't fail the request if tracking fails
    }
  }
}
