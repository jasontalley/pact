/**
 * LLM Controller Tests
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
    it('should return list of providers with status', async () => {
      const result = await controller.getProviders();

      expect(result.providers).toHaveLength(2);
      expect(result.availableCount).toBe(2);
      expect(result.totalCount).toBe(2);
      expect(result.providers[0].name).toBe('openai');
      expect(result.providers[1].name).toBe('ollama');
      expect(providerRegistry.getProviderStatuses).toHaveBeenCalled();
    });

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

      expect(result.providers).toHaveLength(0);
      expect(result.availableCount).toBe(0);
    });
  });

  describe('getModels', () => {
    it('should return list of models with capabilities', async () => {
      const result = await controller.getModels({});

      expect(result.models).toHaveLength(2);
      expect(result.totalCount).toBe(2);
      expect(result.models[0].model).toBe('gpt-5-nano');
      expect(result.models[1].model).toBe('llama3.2');
      expect(result.models[1].isLocal).toBe(true);
      expect(providerRegistry.getAllAvailableModels).toHaveBeenCalled();
    });

    it('should filter by provider', async () => {
      const result = await controller.getModels({ provider: 'ollama' });

      expect(result.models).toHaveLength(1);
      expect(result.models[0].provider).toBe('ollama');
      expect(result.filter?.provider).toBe('ollama');
    });

    it('should filter by vision support', async () => {
      const result = await controller.getModels({ supportsVision: true } as any);

      // Only llama3.2 supports vision in our mock
      expect(result.models).toHaveLength(1);
      expect(result.models[0].model).toBe('llama3.2');
    });
  });

  describe('getUsageSummary', () => {
    it('should return usage summary for default period (day)', async () => {
      const result = await controller.getUsageSummary({});

      expect(result.period.type).toBe('day');
      expect(result.totals.requests).toBe(100);
      expect(result.totals.successfulRequests).toBe(95);
      expect(result.totals.totalCost).toBe(0.05);
      expect(result.budget).toBeDefined();
      expect(result.budget.dailyLimit).toBe(10);
    });

    it('should calculate budget utilization', async () => {
      const result = await controller.getUsageSummary({});

      expect(result.budget.dailyLimit).toBeGreaterThan(0);
      expect(result.budget.monthlyLimit).toBeGreaterThan(0);
    });
  });

  describe('estimateCost', () => {
    it('should estimate cost for atomization task', async () => {
      const result = await controller.estimateCost({
        taskType: AgentTaskType.ATOMIZATION,
        inputTokens: 1000,
        outputTokens: 500,
      });

      expect(result.taskType).toBe(AgentTaskType.ATOMIZATION);
      expect(result.budgetMode).toBe('normal');
      expect(result.inputTokens).toBe(1000);
      expect(result.outputTokens).toBe(500);
      expect(result.recommendations).toHaveLength(2);
      expect(result.localModelsAvailable).toBe(true);
      expect(modelRouter.estimateTaskCost).toHaveBeenCalled();
      expect(modelRouter.getRecommendedModels).toHaveBeenCalled();
    });

    it('should respect budget mode', async () => {
      const result = await controller.estimateCost({
        taskType: AgentTaskType.CLASSIFICATION,
        inputTokens: 500,
        outputTokens: 100,
        budgetMode: 'economy',
      });

      expect(result.budgetMode).toBe('economy');
      expect(modelRouter.estimateTaskCost).toHaveBeenCalledWith(
        AgentTaskType.CLASSIFICATION,
        500,
        100,
        'economy',
      );
    });

    it('should show free models are available', async () => {
      const result = await controller.estimateCost({
        taskType: AgentTaskType.CODE_GENERATION,
        inputTokens: 2000,
        outputTokens: 1000,
      });

      expect(result.localModelsAvailable).toBe(true);
      expect(result.recommendations.some((r) => r.provider === 'ollama')).toBe(true);
    });
  });
});
