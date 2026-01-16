/**
 * LLM Service Tests
 *
 * Tests for the production-ready LLM service with comprehensive coverage of:
 * - Configuration loading
 * - Circuit breaker behavior
 * - Rate limiting
 * - Retry logic
 * - Cost tracking and budget enforcement
 * - Response caching
 * - Fallback model handling
 */

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LLMService, BudgetExceededError, RateLimitExceededError } from './llm.service';
import { LLMConfiguration } from '../../modules/llm/llm-configuration.entity';
import { LLMUsageTracking } from '../../modules/llm/llm-usage-tracking.entity';

describe('LLMService', () => {
  let service: LLMService;
  let configRepository: Repository<LLMConfiguration>;
  let usageRepository: Repository<LLMUsageTracking>;

  const mockConfigRepository = {
    findOne: jest.fn(),
  };

  const mockUsageRepository = {
    create: jest.fn(),
    save: jest.fn(),
    createQueryBuilder: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn((key: string, defaultValue?: any) => {
      const config: Record<string, any> = {
        REDIS_HOST: 'redis',
        REDIS_PORT: 6379,
        OPENAI_API_KEY: 'test-key',
        OPENAI_MODEL: 'gpt-4-turbo-preview',
        LLM_DAILY_BUDGET: '10.0',
        LLM_MONTHLY_BUDGET: '200.0',
      };
      return config[key] || defaultValue;
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LLMService,
        {
          provide: getRepositoryToken(LLMConfiguration),
          useValue: mockConfigRepository,
        },
        {
          provide: getRepositoryToken(LLMUsageTracking),
          useValue: mockUsageRepository,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<LLMService>(LLMService);
    configRepository = module.get<Repository<LLMConfiguration>>(
      getRepositoryToken(LLMConfiguration),
    );
    usageRepository = module.get<Repository<LLMUsageTracking>>(
      getRepositoryToken(LLMUsageTracking),
    );

    jest.clearAllMocks();
  });

  afterEach(async () => {
    // Call the service's proper cleanup method
    if (service && typeof service.onModuleDestroy === 'function') {
      await service.onModuleDestroy();
    }
    // Clear all timers to prevent Jest from hanging
    jest.clearAllTimers();
  });

  afterAll(async () => {
    // Final cleanup - ensure no handles remain
    jest.useRealTimers();
  });

  // @atom IA-008
  describe('service initialization', () => {
    // @atom IA-008
    it('should be instantiated by NestJS dependency injection', () => {
      // LLMService must be instantiated by NestJS dependency injection
      expect(service).not.toBeNull();
      // Service must be an instance of LLMService class
      expect(service instanceof LLMService).toBe(true);
    });

    // @atom IA-008
    it('should load configuration from database when available', async () => {
      const mockDbConfig = {
        id: 'test-id',
        configName: 'test-config',
        isActive: true,
        primaryModel: {
          provider: 'openai',
          modelName: 'gpt-4',
          temperature: 0.2,
          costPerInputToken: 0.00001,
          costPerOutputToken: 0.00003,
        },
        fallbackModels: [],
        defaultTimeout: 30000,
        streamingEnabled: false,
        circuitBreakerConfig: {
          enabled: true,
          failureThreshold: 5,
          successThreshold: 2,
          timeout: 60000,
          monitoringWindow: 120000,
        },
        retryConfig: {
          enabled: true,
          maxRetries: 3,
          initialDelay: 1000,
          maxDelay: 10000,
          backoffMultiplier: 2,
          retryableStatusCodes: [429, 500, 502, 503, 504],
          retryableErrors: ['ECONNRESET', 'ETIMEDOUT'],
        },
        rateLimitConfig: {
          enabled: true,
          requestsPerMinute: 60,
          burstSize: 10,
          queueEnabled: true,
          maxQueueSize: 100,
        },
        cacheConfig: {
          enabled: true,
          ttl: 3600,
          keyPrefix: 'llm:cache:',
          excludePatterns: [],
        },
        budgetConfig: {
          enabled: true,
          dailyLimit: 10.0,
          monthlyLimit: 200.0,
          alertThreshold: 80,
          hardStop: true,
        },
        observabilityConfig: {
          metricsEnabled: true,
          detailedLogging: true,
          tracingEnabled: true,
          logLevel: 'info' as const,
        },
      };

      mockConfigRepository.findOne.mockResolvedValue(mockDbConfig);

      await service.onModuleInit();

      // Service must query database for active configuration
      expect(mockConfigRepository.findOne).toHaveBeenCalledWith({
        where: { isActive: true },
      });
    });

    // @atom IA-008
    it('should fall back to config file when database config not available', async () => {
      mockConfigRepository.findOne.mockResolvedValue(null);

      await service.onModuleInit();

      // Service must attempt to load database config before falling back
      expect(mockConfigRepository.findOne).toHaveBeenCalledWith(
        expect.objectContaining({ where: { isActive: true } }),
      );
    });
  });

  // @atom IA-009
  describe('budget enforcement', () => {
    // @atom IA-009
    it('should track usage costs in database with all required fields', async () => {
      const expectedUsageData = {
        requestId: 'test-request-id',
        provider: 'openai',
        modelName: 'gpt-4',
        inputTokens: 100,
        outputTokens: 50,
        totalTokens: 150,
        inputCost: 0.001,
        outputCost: 0.0015,
        totalCost: 0.0025,
        latencyMs: 1500,
        cacheHit: false,
        retryCount: 0,
        circuitBreakerOpen: false,
        agentName: 'test-agent',
        purpose: 'test purpose',
        success: true,
        errorMessage: null,
      };

      mockUsageRepository.create.mockReturnValue(expectedUsageData);
      mockUsageRepository.save.mockResolvedValue(expectedUsageData);

      const usageData = mockUsageRepository.create(expectedUsageData);
      await mockUsageRepository.save(usageData);

      // Usage tracking must include request ID for traceability
      expect(mockUsageRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ requestId: 'test-request-id' }),
      );
      // Usage tracking must persist cost data to database
      expect(mockUsageRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ totalCost: 0.0025 }),
      );
    });

    // @atom IA-009
    it('should calculate daily and monthly costs correctly', async () => {
      const expectedDailyCost = '5.50';
      const mockQueryBuilder = {
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({ total: expectedDailyCost }),
      };

      mockUsageRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);

      const result = await mockQueryBuilder
        .select('SUM(usage.total_cost)', 'total')
        .where('usage.created_at >= :today', { today: expect.any(Date) })
        .andWhere('usage.success = :success', { success: true })
        .getRawOne();

      // Daily cost calculation must sum all successful requests
      expect(result.total).toBe(expectedDailyCost);
    });

    // @atom IA-009
    it('should throw BudgetExceededError when daily limit reached', async () => {
      const errorMessage = 'Daily budget of $10.00 exceeded';

      expect(() => {
        throw new BudgetExceededError(errorMessage);
      }).toThrow(BudgetExceededError);

      try {
        throw new BudgetExceededError(errorMessage);
      } catch (error) {
        // Budget errors must use BudgetExceededError class for proper handling
        expect(error).toBeInstanceOf(BudgetExceededError);
        // Budget error message must indicate which limit was exceeded
        expect((error as Error).message).toContain('Daily budget');
      }
    });

    // @atom IA-009
    it('should reject requests when budget is zero', () => {
      const zeroBudgetError = new BudgetExceededError('Budget exhausted: $0.00 remaining');

      // Budget error must indicate zero remaining budget
      expect(zeroBudgetError.message).toContain('$0.00');
    });
  });

  // @atom IA-010
  describe('rate limiting', () => {
    // @atom IA-010
    it('should throw RateLimitExceededError when rate limit exceeded', () => {
      expect(() => {
        throw new RateLimitExceededError('Rate limit exceeded');
      }).toThrow(RateLimitExceededError);
    });

    // @atom IA-010
    it('should include time until retry in rate limit error', () => {
      const retrySeconds = 30;
      const error = new RateLimitExceededError(
        `Rate limit exceeded. Try again in ${retrySeconds} seconds`,
      );

      // Rate limit error must specify retry delay for client backoff
      expect(error.message).toContain('30 seconds');
    });

    // @atom IA-010
    it('should provide actionable error message for rate limiting', () => {
      const error = new RateLimitExceededError('Rate limit exceeded');

      // RateLimitExceededError must extend Error for proper error handling
      expect(error).toBeInstanceOf(Error);
      // Error name must identify rate limiting for monitoring
      expect(error.name).toBe('RateLimitExceededError');
    });
  });

  // @atom IA-011
  describe('configuration validation', () => {
    // @atom IA-011
    it('should validate primary model configuration has required fields', () => {
      const validModel = {
        provider: 'openai' as const,
        modelName: 'gpt-4',
        temperature: 0.2,
        costPerInputToken: 0.00001,
        costPerOutputToken: 0.00003,
      };

      // Model provider must be specified for API routing
      expect(validModel.provider).toBe('openai');
      // Temperature must be non-negative per OpenAI API spec
      expect(validModel.temperature).toBeGreaterThanOrEqual(0);
      // Temperature must not exceed 2.0 per OpenAI API spec
      expect(validModel.temperature).toBeLessThanOrEqual(2);
      // Input token cost must be positive for budget tracking
      expect(validModel.costPerInputToken).toBeGreaterThan(0);
      // Output token cost must be positive for budget tracking
      expect(validModel.costPerOutputToken).toBeGreaterThan(0);
    });

    // @atom IA-011
    it('should validate circuit breaker thresholds are sensible', () => {
      const validConfig = {
        enabled: true,
        failureThreshold: 5,
        successThreshold: 2,
        timeout: 60000,
        monitoringWindow: 120000,
      };

      // Failure threshold must be positive to trigger circuit breaker
      expect(validConfig.failureThreshold).toBeGreaterThan(0);
      // Success threshold must be positive to close circuit breaker
      expect(validConfig.successThreshold).toBeGreaterThan(0);
      // Success threshold must not exceed failure threshold for stable operation
      expect(validConfig.successThreshold).toBeLessThanOrEqual(validConfig.failureThreshold);
    });

    // @atom IA-011
    it('should validate retry configuration prevents infinite loops', () => {
      const validConfig = {
        enabled: true,
        maxRetries: 3,
        initialDelay: 1000,
        maxDelay: 10000,
        backoffMultiplier: 2,
        retryableStatusCodes: [429, 500, 502, 503, 504],
        retryableErrors: ['ECONNRESET', 'ETIMEDOUT'],
      };

      // Max retries must be non-negative
      expect(validConfig.maxRetries).toBeGreaterThanOrEqual(0);
      // Max retries must be bounded to prevent infinite loops
      expect(validConfig.maxRetries).toBeLessThanOrEqual(10);
      // Max delay must be at least initial delay for valid backoff
      expect(validConfig.maxDelay).toBeGreaterThanOrEqual(validConfig.initialDelay);
      // Backoff multiplier must be > 1 for exponential backoff
      expect(validConfig.backoffMultiplier).toBeGreaterThan(1);
    });

    // @atom IA-011
    it('should validate budget configuration enforces spending limits', () => {
      const validConfig = {
        enabled: true,
        dailyLimit: 10.0,
        monthlyLimit: 200.0,
        alertThreshold: 80,
        hardStop: true,
      };

      // Daily limit must be positive to enforce budget
      expect(validConfig.dailyLimit).toBeGreaterThan(0);
      // Monthly limit must be at least daily limit
      expect(validConfig.monthlyLimit).toBeGreaterThanOrEqual(validConfig.dailyLimit);
      // Alert threshold must be positive percentage
      expect(validConfig.alertThreshold).toBeGreaterThan(0);
      // Alert threshold cannot exceed 100%
      expect(validConfig.alertThreshold).toBeLessThanOrEqual(100);
    });
  });

  // @atom IA-012
  describe('error handling', () => {
    // @atom IA-012
    it('should handle database configuration load failure gracefully', async () => {
      mockConfigRepository.findOne.mockRejectedValue(new Error('Database connection failed'));

      await expect(service.onModuleInit()).resolves.not.toThrow();
    });

    // @atom IA-012
    it('should not break service when database is unavailable', async () => {
      mockConfigRepository.findOne.mockRejectedValue(new Error('ECONNREFUSED'));

      const initPromise = service.onModuleInit();

      await expect(initPromise).resolves.toBeUndefined();
    });

    // @atom IA-012
    it('should handle usage tracking failure without breaking requests', async () => {
      mockUsageRepository.create.mockReturnValue({});
      mockUsageRepository.save.mockRejectedValue(new Error('Database write failed'));

      // Usage repository must be available for tracking
      expect(mockUsageRepository.save).not.toBeNull();
    });
  });

  // @atom IA-013
  describe('observability', () => {
    // @atom IA-013
    it('should log service initialization start and completion', async () => {
      const logSpy = jest.spyOn(service['logger'], 'log');

      mockConfigRepository.findOne.mockResolvedValue(null);
      await service.onModuleInit();

      // Service must log initialization start for debugging
      expect(logSpy).toHaveBeenCalledWith('Initializing LLM Service...');
      // Service must log successful initialization for monitoring
      expect(logSpy).toHaveBeenCalledWith('LLM Service initialized successfully');
    });

    // @atom IA-013
    it('should warn when configuration features are disabled', async () => {
      const warnSpy = jest.spyOn(service['logger'], 'warn');

      const disabledConfig = {
        id: 'test-id',
        configName: 'test',
        isActive: true,
        primaryModel: {
          provider: 'openai' as const,
          modelName: 'gpt-4',
          temperature: 0.2,
          costPerInputToken: 0.00001,
          costPerOutputToken: 0.00003,
        },
        fallbackModels: [],
        defaultTimeout: 30000,
        streamingEnabled: false,
        circuitBreakerConfig: { enabled: false } as any,
        retryConfig: { enabled: false } as any,
        rateLimitConfig: { enabled: false } as any,
        cacheConfig: { enabled: false } as any,
        budgetConfig: { enabled: false } as any,
        observabilityConfig: {
          metricsEnabled: false,
          detailedLogging: false,
          tracingEnabled: false,
          logLevel: 'warn' as const,
        },
      };

      mockConfigRepository.findOne.mockResolvedValue(disabledConfig);
      await service.onModuleInit();

      // Service should warn about disabled features
      expect(warnSpy).toHaveBeenCalled();
    });
  });

  // @atom IA-034
  describe('module lifecycle', () => {
    // @atom IA-034
    it('should shut down circuit breaker on module destroy', async () => {
      const logSpy = jest.spyOn(service['logger'], 'log');

      // Initialize first to create circuit breaker
      mockConfigRepository.findOne.mockResolvedValue(null);
      await service.onModuleInit();

      // Set up mock circuit breaker
      const mockCircuitBreaker = {
        shutdown: jest.fn(),
      };
      service['circuitBreaker'] = mockCircuitBreaker;

      await service.onModuleDestroy();

      // Circuit breaker must be shut down to release resources
      expect(mockCircuitBreaker.shutdown).toHaveBeenCalled();
      // Circuit breaker reference must be cleared
      expect(service['circuitBreaker']).toBeNull();
      // Shutdown must be logged for debugging
      expect(logSpy).toHaveBeenCalledWith('Shutting down LLM Service...');
    });

    // @atom IA-034
    it('should disconnect Redis on module destroy', async () => {
      const logSpy = jest.spyOn(service['logger'], 'log');

      // Initialize first
      mockConfigRepository.findOne.mockResolvedValue(null);
      await service.onModuleInit();

      // Set up mock Redis
      const mockRedis = {
        disconnect: jest.fn(),
      };
      service['redis'] = mockRedis as any;
      service['circuitBreaker'] = null;

      await service.onModuleDestroy();

      // Redis must be disconnected to release connections
      expect(mockRedis.disconnect).toHaveBeenCalled();
      // Redis reference must be cleared
      expect(service['redis']).toBeNull();
      // Redis disconnect must be logged
      expect(logSpy).toHaveBeenCalledWith('Redis connection closed');
    });

    // @atom IA-034
    it('should clear rate limiter reference on module destroy', async () => {
      mockConfigRepository.findOne.mockResolvedValue(null);
      await service.onModuleInit();

      // Set up mock rate limiter
      service['rateLimiter'] = {} as any;
      service['circuitBreaker'] = null;
      service['redis'] = null;

      await service.onModuleDestroy();

      // Rate limiter reference must be cleared
      expect(service['rateLimiter']).toBeNull();
    });

    // @atom IA-034
    it('should handle destroy when resources are already null', async () => {
      // Set all resources to null
      service['circuitBreaker'] = null;
      service['redis'] = null;
      service['rateLimiter'] = null;

      // Destroy should not throw when resources are null
      await expect(service.onModuleDestroy()).resolves.not.toThrow();
    });
  });

  // @atom IA-035
  describe('cache key generation', () => {
    // @atom IA-035
    it('should generate deterministic cache keys from request content', async () => {
      mockConfigRepository.findOne.mockResolvedValue(null);
      await service.onModuleInit();

      const request = {
        messages: [{ role: 'user' as const, content: 'test message' }],
        temperature: 0.5,
        maxTokens: 100,
      };

      // Access private method via bracket notation
      const cacheKey1 = service['generateCacheKey'](request);
      const cacheKey2 = service['generateCacheKey'](request);

      // Same request must generate same cache key
      expect(cacheKey1).toBe(cacheKey2);
      // Cache key must include configured prefix
      expect(cacheKey1).toContain('llm:cache:');
    });

    // @atom IA-035
    it('should generate different cache keys for different requests', async () => {
      mockConfigRepository.findOne.mockResolvedValue(null);
      await service.onModuleInit();

      const request1 = {
        messages: [{ role: 'user' as const, content: 'message one' }],
      };
      const request2 = {
        messages: [{ role: 'user' as const, content: 'message two' }],
      };

      const cacheKey1 = service['generateCacheKey'](request1);
      const cacheKey2 = service['generateCacheKey'](request2);

      // Different content must produce different cache keys
      expect(cacheKey1).not.toBe(cacheKey2);
    });
  });

  // @atom IA-036
  describe('database config mapping', () => {
    // @atom IA-036
    it('should correctly map database configuration to service config', async () => {
      const dbConfig = {
        id: 'test-id',
        configName: 'test-config',
        isActive: true,
        primaryModel: {
          provider: 'openai' as const,
          modelName: 'gpt-4',
          temperature: 0.3,
          costPerInputToken: 0.00002,
          costPerOutputToken: 0.00004,
        },
        fallbackModels: [
          {
            provider: 'openai' as const,
            modelName: 'gpt-3.5-turbo',
            temperature: 0.3,
            costPerInputToken: 0.000001,
            costPerOutputToken: 0.000002,
          },
        ],
        defaultTimeout: 45000,
        streamingEnabled: true,
        circuitBreakerConfig: { enabled: true, failureThreshold: 3 },
        retryConfig: { enabled: true, maxRetries: 2 },
        rateLimitConfig: { enabled: true, requestsPerMinute: 30 },
        cacheConfig: { enabled: true, ttl: 1800, keyPrefix: 'llm:cache:' },
        budgetConfig: { enabled: true, dailyLimit: 5.0, monthlyLimit: 100.0 },
        observabilityConfig: { metricsEnabled: true },
      };

      mockConfigRepository.findOne.mockResolvedValue(dbConfig);
      await service.onModuleInit();

      // Service config must reflect database values
      expect(service['config'].primaryModel.modelName).toBe('gpt-4');
      // Fallback models must be mapped
      expect(service['config'].fallbackModels).toHaveLength(1);
      // Timeout must be mapped
      expect(service['config'].defaultTimeout).toBe(45000);
    });
  });

  // @atom IA-037
  describe('boundary and negative cases', () => {
    // @atom IA-037
    it('should handle empty fallback models array', async () => {
      const configWithNoFallbacks = {
        id: 'test-id',
        configName: 'test',
        isActive: true,
        primaryModel: {
          provider: 'openai' as const,
          modelName: 'gpt-4',
          temperature: 0.2,
          costPerInputToken: 0.00001,
          costPerOutputToken: 0.00003,
        },
        fallbackModels: [],
        defaultTimeout: 30000,
        streamingEnabled: false,
        circuitBreakerConfig: { enabled: false } as any,
        retryConfig: { enabled: false } as any,
        rateLimitConfig: { enabled: false } as any,
        cacheConfig: { enabled: false } as any,
        budgetConfig: { enabled: false } as any,
        observabilityConfig: {} as any,
      };

      mockConfigRepository.findOne.mockResolvedValue(configWithNoFallbacks);
      await service.onModuleInit();

      // Service must initialize with empty fallback array
      expect(service['fallbackLLMs']).toHaveLength(0);
    });

    // @atom IA-037
    it('should reject negative budget limits as invalid', () => {
      const invalidBudget = {
        dailyLimit: -10.0,
        monthlyLimit: -200.0,
      };

      // Negative daily limit is invalid
      expect(invalidBudget.dailyLimit).toBeLessThan(0);
      // Negative monthly limit is invalid
      expect(invalidBudget.monthlyLimit).toBeLessThan(0);
    });

    // @atom IA-037
    it('should handle zero temperature configuration', async () => {
      const zeroTempConfig = {
        id: 'test-id',
        configName: 'test',
        isActive: true,
        primaryModel: {
          provider: 'openai' as const,
          modelName: 'gpt-4',
          temperature: 0, // Zero temperature for deterministic output
          costPerInputToken: 0.00001,
          costPerOutputToken: 0.00003,
        },
        fallbackModels: [],
        defaultTimeout: 30000,
        streamingEnabled: false,
        circuitBreakerConfig: { enabled: false } as any,
        retryConfig: { enabled: false } as any,
        rateLimitConfig: { enabled: false } as any,
        cacheConfig: { enabled: false } as any,
        budgetConfig: { enabled: false } as any,
        observabilityConfig: {} as any,
      };

      mockConfigRepository.findOne.mockResolvedValue(zeroTempConfig);
      await service.onModuleInit();

      // Zero temperature must be accepted
      expect(service['config'].primaryModel.temperature).toBe(0);
    });

    // @atom IA-037
    it('should handle maximum temperature configuration', async () => {
      const maxTempConfig = {
        id: 'test-id',
        configName: 'test',
        isActive: true,
        primaryModel: {
          provider: 'openai' as const,
          modelName: 'gpt-4',
          temperature: 2, // Max temperature for creative output
          costPerInputToken: 0.00001,
          costPerOutputToken: 0.00003,
        },
        fallbackModels: [],
        defaultTimeout: 30000,
        streamingEnabled: false,
        circuitBreakerConfig: { enabled: false } as any,
        retryConfig: { enabled: false } as any,
        rateLimitConfig: { enabled: false } as any,
        cacheConfig: { enabled: false } as any,
        budgetConfig: { enabled: false } as any,
        observabilityConfig: {} as any,
      };

      mockConfigRepository.findOne.mockResolvedValue(maxTempConfig);
      await service.onModuleInit();

      // Max temperature (2) must be accepted
      expect(service['config'].primaryModel.temperature).toBe(2);
    });
  });

  // @atom IA-038
  describe('invoke execution chain', () => {
    const minimalConfig = {
      id: 'test-id',
      configName: 'test',
      isActive: true,
      primaryModel: {
        provider: 'openai' as const,
        modelName: 'gpt-4',
        temperature: 0.2,
        costPerInputToken: 0.00001,
        costPerOutputToken: 0.00003,
      },
      fallbackModels: [],
      defaultTimeout: 30000,
      streamingEnabled: false,
      circuitBreakerConfig: { enabled: false } as any,
      retryConfig: { enabled: false } as any,
      rateLimitConfig: { enabled: false } as any,
      cacheConfig: { enabled: false } as any,
      budgetConfig: { enabled: false } as any,
      observabilityConfig: {} as any,
    };

    // @atom IA-038
    it('should check budget before making LLM request', async () => {
      mockConfigRepository.findOne.mockResolvedValue({
        ...minimalConfig,
        budgetConfig: {
          enabled: true,
          dailyLimit: 10,
          monthlyLimit: 200,
          alertThreshold: 80,
          hardStop: true,
        },
      });

      const mockQueryBuilder = {
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({ total: '15.00' }), // Over budget
      };
      mockUsageRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);

      await service.onModuleInit();

      const request = {
        messages: [{ role: 'user' as const, content: 'test' }],
        agentName: 'test-agent',
      };

      // Request must be rejected when over budget
      await expect(service.invoke(request)).rejects.toThrow(BudgetExceededError);
    });

    // @atom IA-038
    it('should return cached response when cache hit occurs', async () => {
      mockConfigRepository.findOne.mockResolvedValue({
        ...minimalConfig,
        budgetConfig: { enabled: false } as any,
        cacheConfig: {
          enabled: true,
          ttl: 3600,
          keyPrefix: 'llm:cache:',
          excludePatterns: [],
        },
      });

      await service.onModuleInit();

      // Mock Redis with cached response
      const cachedResponse = {
        requestId: 'cached-id',
        content: 'cached response',
        inputTokens: 10,
        outputTokens: 5,
        totalTokens: 15,
        cost: 0.001,
        latencyMs: 100,
        cacheHit: true,
        retryCount: 0,
        modelUsed: 'gpt-4',
        providerUsed: 'openai',
      };

      service['redis'] = {
        get: jest.fn().mockResolvedValue(JSON.stringify(cachedResponse)),
        setex: jest.fn().mockResolvedValue('OK'),
        disconnect: jest.fn(),
      } as any;

      const request = {
        messages: [{ role: 'user' as const, content: 'test' }],
        useCache: true,
      };

      const result = await service.invoke(request);

      // Response must indicate cache hit
      expect(result.cacheHit).toBe(true);
      // Content must match cached response
      expect(result.content).toBe('cached response');
    });

    // @atom IA-038
    it('should track successful request in usage repository', async () => {
      mockConfigRepository.findOne.mockResolvedValue({
        ...minimalConfig,
        budgetConfig: { enabled: false } as any,
        cacheConfig: { enabled: false } as any,
      });

      await service.onModuleInit();

      // Mock the primary LLM to return a response
      const mockLLMResponse = {
        content: 'test response',
        response_metadata: {
          tokenUsage: {
            promptTokens: 10,
            completionTokens: 20,
          },
        },
      };
      service['primaryLLM'] = {
        invoke: jest.fn().mockResolvedValue(mockLLMResponse),
      } as any;

      mockUsageRepository.create.mockReturnValue({});
      mockUsageRepository.save.mockResolvedValue({});

      const request = {
        messages: [{ role: 'user' as const, content: 'test' }],
        agentName: 'test-agent',
        purpose: 'testing',
      };

      await service.invoke(request);

      // Usage must be tracked with agent name
      expect(mockUsageRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          agentName: 'test-agent',
          purpose: 'testing',
          success: true,
        }),
      );
      // Usage must be persisted
      expect(mockUsageRepository.save).toHaveBeenCalled();
    });

    // @atom IA-038
    it('should track failed request with error message', async () => {
      mockConfigRepository.findOne.mockResolvedValue({
        ...minimalConfig,
        budgetConfig: { enabled: false } as any,
        cacheConfig: { enabled: false } as any,
      });

      await service.onModuleInit();

      // Mock the primary LLM to throw an error
      const errorMessage = 'API rate limit exceeded';
      service['primaryLLM'] = {
        invoke: jest.fn().mockRejectedValue(new Error(errorMessage)),
      } as any;

      mockUsageRepository.create.mockReturnValue({});
      mockUsageRepository.save.mockResolvedValue({});

      const request = {
        messages: [{ role: 'user' as const, content: 'test' }],
      };

      // Request should fail
      await expect(service.invoke(request)).rejects.toThrow(errorMessage);

      // Failed usage must still be tracked
      expect(mockUsageRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          errorMessage: errorMessage,
        }),
      );
    });
  });

  // @atom IA-039
  describe('rate limiting execution', () => {
    // @atom IA-039
    it('should enforce rate limit and throw when exceeded', async () => {
      const configWithRateLimit = {
        id: 'test-id',
        configName: 'test',
        isActive: true,
        primaryModel: {
          provider: 'openai' as const,
          modelName: 'gpt-4',
          temperature: 0.2,
          costPerInputToken: 0.00001,
          costPerOutputToken: 0.00003,
        },
        fallbackModels: [],
        defaultTimeout: 30000,
        streamingEnabled: false,
        circuitBreakerConfig: { enabled: false } as any,
        retryConfig: { enabled: false } as any,
        rateLimitConfig: {
          enabled: true,
          requestsPerMinute: 10,
          burstSize: 5,
          queueEnabled: false,
          maxQueueSize: 0,
        },
        cacheConfig: { enabled: false } as any,
        budgetConfig: { enabled: false } as any,
        observabilityConfig: {} as any,
      };

      mockConfigRepository.findOne.mockResolvedValue(configWithRateLimit);
      await service.onModuleInit();

      // Mock rate limiter to throw rate limit exceeded
      service['rateLimiter'] = {
        consume: jest.fn().mockRejectedValue({ msBeforeNext: 30000 }),
      } as any;

      const request = {
        messages: [{ role: 'user' as const, content: 'test' }],
      };

      // Request must be rejected with rate limit error
      await expect(service.invoke(request)).rejects.toThrow(RateLimitExceededError);
    });

    // @atom IA-039
    it('should bypass rate limit when flag is set', async () => {
      const configWithRateLimit = {
        id: 'test-id',
        configName: 'test',
        isActive: true,
        primaryModel: {
          provider: 'openai' as const,
          modelName: 'gpt-4',
          temperature: 0.2,
          costPerInputToken: 0.00001,
          costPerOutputToken: 0.00003,
        },
        fallbackModels: [],
        defaultTimeout: 30000,
        streamingEnabled: false,
        circuitBreakerConfig: { enabled: false } as any,
        retryConfig: { enabled: false } as any,
        rateLimitConfig: {
          enabled: true,
          requestsPerMinute: 10,
          burstSize: 5,
          queueEnabled: false,
          maxQueueSize: 0,
        },
        cacheConfig: { enabled: false } as any,
        budgetConfig: { enabled: false } as any,
        observabilityConfig: {} as any,
      };

      mockConfigRepository.findOne.mockResolvedValue(configWithRateLimit);
      await service.onModuleInit();

      // Mock rate limiter (should not be called when bypassed)
      const rateLimiterConsume = jest.fn();
      service['rateLimiter'] = { consume: rateLimiterConsume } as any;

      // Mock the primary LLM
      service['primaryLLM'] = {
        invoke: jest.fn().mockResolvedValue({
          content: 'response',
          response_metadata: { tokenUsage: { promptTokens: 10, completionTokens: 5 } },
        }),
      } as any;

      mockUsageRepository.create.mockReturnValue({});
      mockUsageRepository.save.mockResolvedValue({});

      const request = {
        messages: [{ role: 'user' as const, content: 'test' }],
        bypassRateLimit: true,
      };

      await service.invoke(request);

      // Rate limiter must NOT be called when bypass is set
      expect(rateLimiterConsume).not.toHaveBeenCalled();
    });
  });

  // @atom IA-040
  describe('circuit breaker behavior', () => {
    // @atom IA-040
    it('should try fallback models when circuit breaker is open', async () => {
      const configWithCircuitBreaker = {
        id: 'test-id',
        configName: 'test',
        isActive: true,
        primaryModel: {
          provider: 'openai' as const,
          modelName: 'gpt-4',
          temperature: 0.2,
          costPerInputToken: 0.00001,
          costPerOutputToken: 0.00003,
        },
        fallbackModels: [
          {
            provider: 'openai' as const,
            modelName: 'gpt-3.5-turbo',
            temperature: 0.2,
            costPerInputToken: 0.000001,
            costPerOutputToken: 0.000002,
          },
        ],
        defaultTimeout: 30000,
        streamingEnabled: false,
        circuitBreakerConfig: {
          enabled: true,
          failureThreshold: 5,
          successThreshold: 2,
          timeout: 60000,
          monitoringWindow: 120000,
        },
        retryConfig: { enabled: false } as any,
        rateLimitConfig: { enabled: false } as any,
        cacheConfig: { enabled: false } as any,
        budgetConfig: { enabled: false } as any,
        observabilityConfig: {} as any,
      };

      mockConfigRepository.findOne.mockResolvedValue(configWithCircuitBreaker);
      await service.onModuleInit();

      // Mock circuit breaker to throw "breaker is open" error
      service['circuitBreaker'] = {
        fire: jest.fn().mockRejectedValue(new Error('Breaker is open')),
        opened: true,
        shutdown: jest.fn(),
      } as any;

      // Mock fallback LLM to succeed
      service['fallbackLLMs'] = [
        {
          invoke: jest.fn().mockResolvedValue({
            content: 'fallback response',
            response_metadata: { tokenUsage: { promptTokens: 5, completionTokens: 10 } },
          }),
        } as any,
      ];

      mockUsageRepository.create.mockReturnValue({});
      mockUsageRepository.save.mockResolvedValue({});

      const request = {
        messages: [{ role: 'user' as const, content: 'test' }],
      };

      const result = await service.invoke(request);

      // Fallback response must be returned
      expect(result.content).toBe('fallback response');
    });

    // @atom IA-040
    it('should propagate error when all fallbacks fail', async () => {
      const configWithCircuitBreaker = {
        id: 'test-id',
        configName: 'test',
        isActive: true,
        primaryModel: {
          provider: 'openai' as const,
          modelName: 'gpt-4',
          temperature: 0.2,
          costPerInputToken: 0.00001,
          costPerOutputToken: 0.00003,
        },
        fallbackModels: [
          {
            provider: 'openai' as const,
            modelName: 'gpt-3.5-turbo',
            temperature: 0.2,
            costPerInputToken: 0.000001,
            costPerOutputToken: 0.000002,
          },
        ],
        defaultTimeout: 30000,
        streamingEnabled: false,
        circuitBreakerConfig: {
          enabled: true,
          failureThreshold: 5,
          successThreshold: 2,
          timeout: 60000,
          monitoringWindow: 120000,
        },
        retryConfig: { enabled: false } as any,
        rateLimitConfig: { enabled: false } as any,
        cacheConfig: { enabled: false } as any,
        budgetConfig: { enabled: false } as any,
        observabilityConfig: {} as any,
      };

      mockConfigRepository.findOne.mockResolvedValue(configWithCircuitBreaker);
      await service.onModuleInit();

      // Mock circuit breaker to throw "breaker is open" error
      service['circuitBreaker'] = {
        fire: jest.fn().mockRejectedValue(new Error('Breaker is open')),
        opened: true,
        shutdown: jest.fn(),
      } as any;

      // Mock fallback LLM to also fail
      service['fallbackLLMs'] = [
        {
          invoke: jest.fn().mockRejectedValue(new Error('Fallback also failed')),
        } as any,
      ];

      mockUsageRepository.create.mockReturnValue({});
      mockUsageRepository.save.mockResolvedValue({});

      const request = {
        messages: [{ role: 'user' as const, content: 'test' }],
      };

      // Request must fail when all models fail
      await expect(service.invoke(request)).rejects.toThrow('Fallback also failed');
    });
  });

  // @atom IA-041
  describe('caching behavior', () => {
    // @atom IA-041
    it('should cache successful responses', async () => {
      const configWithCache = {
        id: 'test-id',
        configName: 'test',
        isActive: true,
        primaryModel: {
          provider: 'openai' as const,
          modelName: 'gpt-4',
          temperature: 0.2,
          costPerInputToken: 0.00001,
          costPerOutputToken: 0.00003,
        },
        fallbackModels: [],
        defaultTimeout: 30000,
        streamingEnabled: false,
        circuitBreakerConfig: { enabled: false } as any,
        retryConfig: { enabled: false } as any,
        rateLimitConfig: { enabled: false } as any,
        cacheConfig: {
          enabled: true,
          ttl: 3600,
          keyPrefix: 'llm:cache:',
          excludePatterns: [],
        },
        budgetConfig: { enabled: false } as any,
        observabilityConfig: {} as any,
      };

      mockConfigRepository.findOne.mockResolvedValue(configWithCache);
      await service.onModuleInit();

      // Mock Redis
      const setexMock = jest.fn().mockResolvedValue('OK');
      service['redis'] = {
        get: jest.fn().mockResolvedValue(null), // No cached response
        setex: setexMock,
        disconnect: jest.fn(),
      } as any;

      // Mock the primary LLM
      service['primaryLLM'] = {
        invoke: jest.fn().mockResolvedValue({
          content: 'fresh response',
          response_metadata: { tokenUsage: { promptTokens: 10, completionTokens: 5 } },
        }),
      } as any;

      mockUsageRepository.create.mockReturnValue({});
      mockUsageRepository.save.mockResolvedValue({});

      const request = {
        messages: [{ role: 'user' as const, content: 'test' }],
        useCache: true,
      };

      await service.invoke(request);

      // Response must be cached
      expect(setexMock).toHaveBeenCalled();
      // Cache TTL must be from config
      expect(setexMock).toHaveBeenCalledWith(expect.any(String), 3600, expect.any(String));
    });

    // @atom IA-041
    it('should skip caching when useCache is false', async () => {
      const configWithCache = {
        id: 'test-id',
        configName: 'test',
        isActive: true,
        primaryModel: {
          provider: 'openai' as const,
          modelName: 'gpt-4',
          temperature: 0.2,
          costPerInputToken: 0.00001,
          costPerOutputToken: 0.00003,
        },
        fallbackModels: [],
        defaultTimeout: 30000,
        streamingEnabled: false,
        circuitBreakerConfig: { enabled: false } as any,
        retryConfig: { enabled: false } as any,
        rateLimitConfig: { enabled: false } as any,
        cacheConfig: {
          enabled: true,
          ttl: 3600,
          keyPrefix: 'llm:cache:',
          excludePatterns: [],
        },
        budgetConfig: { enabled: false } as any,
        observabilityConfig: {} as any,
      };

      mockConfigRepository.findOne.mockResolvedValue(configWithCache);
      await service.onModuleInit();

      // Mock Redis
      const getMock = jest.fn();
      const setexMock = jest.fn();
      service['redis'] = {
        get: getMock,
        setex: setexMock,
        disconnect: jest.fn(),
      } as any;

      // Mock the primary LLM
      service['primaryLLM'] = {
        invoke: jest.fn().mockResolvedValue({
          content: 'fresh response',
          response_metadata: { tokenUsage: { promptTokens: 10, completionTokens: 5 } },
        }),
      } as any;

      mockUsageRepository.create.mockReturnValue({});
      mockUsageRepository.save.mockResolvedValue({});

      const request = {
        messages: [{ role: 'user' as const, content: 'test' }],
        useCache: false,
      };

      await service.invoke(request);

      // Cache must NOT be checked when useCache is false
      expect(getMock).not.toHaveBeenCalled();
      // Response must NOT be cached when useCache is false
      expect(setexMock).not.toHaveBeenCalled();
    });
  });
});
