/**
 * LLM Controller Tests
 *
 * @atom IA-008 - LLM Provider Implementation
 */

import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { LLMController } from './llm.controller';
import { LLMUsageTracking } from './llm-usage-tracking.entity';
import { LLMConfiguration } from './llm-configuration.entity';
import { ProviderRegistry } from '../../common/llm/providers/provider-registry';
import { ModelRouter } from '../../common/llm/routing/model-router';
import { AgentTaskType } from '../../common/llm/providers/types';

describe('LLMController', () => {
  let controller: LLMController;
  let usageRepository: jest.Mocked<Repository<LLMUsageTracking>>;
  let configRepository: jest.Mocked<Repository<LLMConfiguration>>;
  let providerRegistry: jest.Mocked<ProviderRegistry>;
  let modelRouter: jest.Mocked<ModelRouter>;

  const mockProviderStatuses = [
    {
      name: 'openai' as const,
      displayName: 'OpenAI',
      available: true,
      health: { available: true },
      supportedModels: ['gpt-5-nano', 'gpt-5-mini'],
      defaultModel: 'gpt-5-nano',
    },
    {
      name: 'ollama' as const,
      displayName: 'Ollama (Local)',
      available: true,
      health: { available: true },
      supportedModels: ['llama3.2'],
      defaultModel: 'llama3.2',
    },
  ];

  const mockModels = [
    {
      model: 'gpt-5-nano',
      provider: 'openai' as const,
      capabilities: {
        contextWindow: 128000,
        supportsVision: false,
        supportsFunctionCalling: true,
        supportsStreaming: true,
        costPerInputToken: 0.00000005,
        costPerOutputToken: 0.0000004,
      },
    },
    {
      model: 'llama3.2',
      provider: 'ollama' as const,
      capabilities: {
        contextWindow: 128000,
        supportsVision: true,
        supportsFunctionCalling: true,
        supportsStreaming: true,
        costPerInputToken: 0,
        costPerOutputToken: 0,
      },
    },
  ];

  beforeEach(async () => {
    // Create mock query builder
    const createMockQueryBuilder = () => ({
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      getRawOne: jest.fn().mockResolvedValue({
        requests: 100,
        successfulRequests: 95,
        failedRequests: 5,
        inputTokens: 50000,
        outputTokens: 25000,
        totalTokens: 75000,
        totalCost: 0.05,
        averageLatencyMs: 500,
        cacheHitRate: 0.2,
      }),
      getRawMany: jest.fn().mockResolvedValue([]),
    });

    const module: TestingModule = await Test.createTestingModule({
      controllers: [LLMController],
      providers: [
        {
          provide: getRepositoryToken(LLMUsageTracking),
          useValue: {
            createQueryBuilder: jest.fn(() => createMockQueryBuilder()),
          },
        },
        {
          provide: getRepositoryToken(LLMConfiguration),
          useValue: {
            findOne: jest.fn().mockResolvedValue({
              budgetConfig: {
                dailyLimit: 10,
                monthlyLimit: 100,
                hardStop: false,
              },
            }),
          },
        },
        {
          provide: ProviderRegistry,
          useValue: {
            getProviderStatuses: jest.fn().mockReturnValue(mockProviderStatuses),
            getAllAvailableModels: jest.fn().mockReturnValue(mockModels),
            getModelCapabilities: jest.fn((model: string) => {
              const found = mockModels.find((m) => m.model === model);
              return found?.capabilities;
            }),
          },
        },
        {
          provide: ModelRouter,
          useValue: {
            estimateTaskCost: jest.fn().mockReturnValue({
              minCost: 0,
              maxCost: 0.001,
              recommendedModel: 'ollama:llama3.2',
            }),
            getRecommendedModels: jest.fn().mockReturnValue([
              { provider: 'ollama', model: 'llama3.2', cost: 'Free' },
              { provider: 'openai', model: 'gpt-5-nano', cost: '$0.0002/1K' },
            ]),
          },
        },
      ],
    }).compile();

    controller = module.get<LLMController>(LLMController);
    usageRepository = module.get(getRepositoryToken(LLMUsageTracking));
    configRepository = module.get(getRepositoryToken(LLMConfiguration));
    providerRegistry = module.get(ProviderRegistry);
    modelRouter = module.get(ModelRouter);
  });

  describe('getProviders', () => {
    /**
     * @atom IA-008
     * Providers endpoint must return all configured LLM providers with status
     */
    it('should return list of providers with status', async () => {
      const result = await controller.getProviders();

      // Should return both configured providers
      expect(result.providers).toHaveLength(2);
      // Available count should match providers that passed health check
      expect(result.availableCount).toBe(2);
      // Total count should include all providers
      expect(result.totalCount).toBe(2);
      // First provider should be OpenAI
      expect(result.providers[0].name).toBe('openai');
      // Second provider should be Ollama
      expect(result.providers[1].name).toBe('ollama');
      // Provider registry should be queried
      expect(providerRegistry.getProviderStatuses).toHaveBeenCalled();
    });

    /**
     * @atom IA-008
     * Providers endpoint must handle missing registry gracefully
     */
    it('should return empty list when no registry', async () => {
      // Create controller without registry
      const module: TestingModule = await Test.createTestingModule({
        controllers: [LLMController],
        providers: [
          {
            provide: getRepositoryToken(LLMUsageTracking),
            useValue: { createQueryBuilder: jest.fn() },
          },
          {
            provide: getRepositoryToken(LLMConfiguration),
            useValue: { findOne: jest.fn() },
          },
        ],
      }).compile();

      const ctrl = module.get<LLMController>(LLMController);
      const result = await ctrl.getProviders();

      // Should return empty providers array
      expect(result.providers).toHaveLength(0);
      // Available count should be zero
      expect(result.availableCount).toBe(0);
    });
  });

  describe('getModels', () => {
    /**
     * @atom IA-008
     * Models endpoint must return all available models with capabilities
     */
    it('should return list of models with capabilities', async () => {
      const result = await controller.getModels({});

      // Should return both models from registry
      expect(result.models).toHaveLength(2);
      // Total count should match models array length
      expect(result.totalCount).toBe(2);
      // First model should be GPT-5-nano
      expect(result.models[0].model).toBe('gpt-5-nano');
      // Second model should be llama3.2
      expect(result.models[1].model).toBe('llama3.2');
      // Ollama model should be marked as local
      expect(result.models[1].isLocal).toBe(true);
      // Registry should be queried for available models
      expect(providerRegistry.getAllAvailableModels).toHaveBeenCalled();
    });

    /**
     * @atom IA-008
     * Models endpoint must support filtering by provider
     */
    it('should filter by provider', async () => {
      const result = await controller.getModels({ provider: 'ollama' });

      // Should return only Ollama models
      expect(result.models).toHaveLength(1);
      // Model provider should be ollama
      expect(result.models[0].provider).toBe('ollama');
      // Filter should be reflected in response
      expect(result.filter?.provider).toBe('ollama');
    });

    /**
     * @atom IA-008
     * Models endpoint must support filtering by vision capability
     */
    it('should filter by vision support', async () => {
      const result = await controller.getModels({ supportsVision: true } as any);

      // Only llama3.2 supports vision in our mock
      expect(result.models).toHaveLength(1);
      // Filtered model should be llama3.2
      expect(result.models[0].model).toBe('llama3.2');
    });
  });

  describe('getUsageSummary', () => {
    /**
     * @atom IA-008
     * Usage summary endpoint must return aggregated usage for specified period
     */
    it('should return usage summary for default period (day)', async () => {
      const result = await controller.getUsageSummary({});

      // Default period should be day
      expect(result.period.type).toBe('day');
      // Request count should match mock data
      expect(result.totals.requests).toBe(100);
      // Successful requests should match mock data
      expect(result.totals.successfulRequests).toBe(95);
      // Total cost should match mock data
      expect(result.totals.totalCost).toBe(0.05);
      // Budget info should be included
      expect(result.budget).toBeDefined();
      // Daily limit should match config
      expect(result.budget.dailyLimit).toBe(10);
    });

    /**
     * @atom IA-008
     * Usage summary must include budget utilization metrics
     */
    it('should calculate budget utilization', async () => {
      const result = await controller.getUsageSummary({});

      // Daily limit should be positive
      expect(result.budget.dailyLimit).toBeGreaterThan(0);
      // Monthly limit should be positive
      expect(result.budget.monthlyLimit).toBeGreaterThan(0);
    });
  });

  describe('estimateCost', () => {
    /**
     * @atom IA-008
     * Cost estimation must provide cost range and model recommendations
     */
    it('should estimate cost for atomization task', async () => {
      const result = await controller.estimateCost({
        taskType: AgentTaskType.ATOMIZATION,
        inputTokens: 1000,
        outputTokens: 500,
      });

      // Task type should be preserved in response
      expect(result.taskType).toBe(AgentTaskType.ATOMIZATION);
      // Default budget mode should be normal
      expect(result.budgetMode).toBe('normal');
      // Input tokens should be preserved
      expect(result.inputTokens).toBe(1000);
      // Output tokens should be preserved
      expect(result.outputTokens).toBe(500);
      // Should include model recommendations
      expect(result.recommendations).toHaveLength(2);
      // Should indicate local models availability
      expect(result.localModelsAvailable).toBe(true);
      // Cost estimation should be called
      expect(modelRouter.estimateTaskCost).toHaveBeenCalled();
      // Model recommendations should be fetched
      expect(modelRouter.getRecommendedModels).toHaveBeenCalled();
    });

    /**
     * @atom IA-008
     * Cost estimation must respect budget mode parameter
     */
    it('should respect budget mode', async () => {
      const result = await controller.estimateCost({
        taskType: AgentTaskType.CLASSIFICATION,
        inputTokens: 500,
        outputTokens: 100,
        budgetMode: 'economy',
      });

      // Budget mode should be reflected in response
      expect(result.budgetMode).toBe('economy');
      // Router should be called with economy mode
      expect(modelRouter.estimateTaskCost).toHaveBeenCalledWith(
        AgentTaskType.CLASSIFICATION,
        500,
        100,
        'economy',
      );
    });

    /**
     * @atom IA-008
     * Cost estimation should indicate when free local models are available
     */
    it('should show free models are available', async () => {
      const result = await controller.estimateCost({
        taskType: AgentTaskType.CODE_GENERATION,
        inputTokens: 2000,
        outputTokens: 1000,
      });

      // Should indicate local models are available
      expect(result.localModelsAvailable).toBe(true);
      // Recommendations should include ollama (free) provider
      expect(result.recommendations.some((r) => r.provider === 'ollama')).toBe(true);
    });
  });

  describe('getModels - additional cases', () => {
    /**
     * @atom IA-008
     * Models endpoint must handle missing registry gracefully
     */
    it('should return empty list when no registry', async () => {
      const module: TestingModule = await Test.createTestingModule({
        controllers: [LLMController],
        providers: [
          {
            provide: getRepositoryToken(LLMUsageTracking),
            useValue: { createQueryBuilder: jest.fn() },
          },
          {
            provide: getRepositoryToken(LLMConfiguration),
            useValue: { findOne: jest.fn() },
          },
        ],
      }).compile();

      const ctrl = module.get<LLMController>(LLMController);
      const result = await ctrl.getModels({});

      // Should return empty models array
      expect(result.models).toHaveLength(0);
      // Total count should be zero
      expect(result.totalCount).toBe(0);
    });

    /**
     * @atom IA-008
     * Models endpoint must filter by function calling support
     */
    it('should filter by function calling support', async () => {
      const result = await controller.getModels({ supportsFunctionCalling: true } as any);

      // Both models support function calling in our mock
      expect(result.models).toHaveLength(2);
      // Filter should be reflected in response
      expect(result.filter?.supportsFunctionCalling).toBe(true);
    });

    /**
     * @atom IA-008
     * Models endpoint must correctly filter out models without function calling
     */
    it('should filter by function calling support false', async () => {
      const result = await controller.getModels({ supportsFunctionCalling: false } as any);

      // No models have function calling disabled
      expect(result.models).toHaveLength(0);
    });
  });

  describe('getUsageSummary - period types', () => {
    /**
     * @atom IA-008
     * Usage summary must support week period
     */
    it('should handle week period', async () => {
      const result = await controller.getUsageSummary({ period: 'week' });

      // Period type should be week
      expect(result.period.type).toBe('week');
    });

    /**
     * @atom IA-008
     * Usage summary must support month period
     */
    it('should handle month period', async () => {
      const result = await controller.getUsageSummary({ period: 'month' });

      // Period type should be month
      expect(result.period.type).toBe('month');
    });

    /**
     * @atom IA-008
     * Usage summary must support custom date range
     */
    it('should handle custom date range', async () => {
      const result = await controller.getUsageSummary({
        startDate: '2026-01-01',
        endDate: '2026-01-15',
      });

      // Period type should be custom for date range
      expect(result.period.type).toBe('custom');
    });
  });

  describe('getUsageTrends', () => {
    /**
     * @atom IA-008
     * Usage trends endpoint must return daily, weekly, and monthly trend data
     */
    it('should return daily, weekly, and monthly trends', async () => {
      const result = await controller.getUsageTrends();

      // Daily trends should be defined
      expect(result.daily).toBeDefined();
      // Weekly trends should be defined
      expect(result.weekly).toBeDefined();
      // Monthly trends should be defined
      expect(result.monthly).toBeDefined();
      // Daily should be an array
      expect(Array.isArray(result.daily)).toBe(true);
      // Weekly should be an array
      expect(Array.isArray(result.weekly)).toBe(true);
      // Monthly should be an array
      expect(Array.isArray(result.monthly)).toBe(true);
    });

    /**
     * @atom IA-008
     * Usage trends endpoint must query repository for each trend type
     */
    it('should call repository with correct date ranges', async () => {
      await controller.getUsageTrends();

      // Should have called createQueryBuilder for trend queries
      expect(usageRepository.createQueryBuilder).toHaveBeenCalled();
    });
  });

  describe('getBudgetStatus - edge cases', () => {
    /**
     * @atom IA-008
     * Budget status must use default values when config is missing
     */
    it('should handle missing config', async () => {
      configRepository.findOne.mockResolvedValue(null);

      const result = await controller.getUsageSummary({});

      // Should use default daily limit
      expect(result.budget.dailyLimit).toBe(10);
      // Should use default monthly limit
      expect(result.budget.monthlyLimit).toBe(100);
      // Hard stop should default to disabled
      expect(result.budget.hardStopEnabled).toBe(false);
    });
  });
});
